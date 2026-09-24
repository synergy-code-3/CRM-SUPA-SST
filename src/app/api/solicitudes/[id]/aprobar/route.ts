import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { altaCompletaCliente, otorgarAccesoKajabiYSkool } from "@/lib/alta-cliente";
import {
  activarOfertaComoCompra,
  agregarNota,
  agregarNotaAlPerfil,
  aplicarSolicitudAClienteExistente,
  marcarSoloInvitacionSkoolEnviada,
  normalizarEmail,
  obtenerCliente,
  renovarMembresia,
} from "@/lib/db";
import { finAccesoConEtiqueta, formatearFechaSkool } from "@/lib/fechas";
import { invitarASkool } from "@/lib/skool";
import { marcarSolicitudAprobada, obtenerSolicitud } from "@/lib/solicitudes";
import { marcarAccesoDadoVsl } from "@/lib/vsl-soporte";

// Cuando el correo de acceso YA es cliente, no hay una única forma correcta
// de aprobar la solicitud — depende de qué fue realmente la compra:
//  - "renovacion": funciona exactamente como el botón "Renovar membresía"
//    del perfil (regla fija de boletos por país, otorga la oferta en Kajabi
//    de verdad).
//  - "black_access": el pase Black Access es un extra que se le suma a los
//    accesos que ya tenía (no toca Kajabi — ya tiene acceso al Club, esto
//    es aparte), + 3 meses de Skool. No se combina con "renovacion": son
//    dos etiquetas distintas, mutuamente excluyentes.
//  - "activar": como el botón "Activar oferta" — se le da acceso como una
//    compra más (boletos por su evento, no la regla fija de país), también
//    otorgando la oferta real en Kajabi.
//  - "sin_cambios": el admin va a resolverlo a mano por fuera de este
//    flujo — la solicitud se marca aprobada nada más, sin tocar el cliente.
type ModoAprobarExistente = "renovacion" | "black_access" | "activar" | "sin_cambios";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("revisarSolicitudes");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const solicitud = await obtenerSolicitud(id);
  if (!solicitud) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  if (solicitud.estado !== "pendiente") {
    return NextResponse.json({ error: "Esta solicitud ya fue revisada" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const modo = body?.modo as ModoAprobarExistente | undefined;

  try {
    // correoAcceso es el identificador del cliente en el CRM/Kajabi/Skool;
    // correoPago queda solo como referencia en las notas, para conciliar el
    // pago si hace falta.
    const existente = await obtenerCliente(normalizarEmail(solicitud.correoAcceso));

    // Si ya es cliente y el front todavía no mandó el modo, se corta aquí
    // sin tocar nada — el front le pregunta al admin qué hacer (ver
    // solicitudes/page.tsx) y reintenta con el modo elegido.
    if (existente && !modo) {
      return NextResponse.json(
        {
          necesitaModo: true,
          clienteExistente: {
            id: existente.id,
            nombre: existente.nombre,
            accesoPlataforma: existente.accesoPlataforma,
            pausadoEn: existente.pausadoEn,
          },
        },
        { status: 409 }
      );
    }

    let cliente;
    let avisoKajabi: string | null = null;
    let avisoSkool: string | null = null;
    let avisoGhl: string | null = null;
    // Solo con Black Access: recordatorio de ajustar en Kajabi el fin de acceso.
    let recordatorioKajabi: string | null = null;

    // Nota del vendedor (campo "Notas" del formulario de la solicitud) — se
    // agrega a las Notas del cliente en cualquier caso que sí toque el
    // perfil, con quién la escribió, para no perder ese contexto una vez
    // aprobada la solicitud.
    const notaSolicitud = solicitud.notas?.trim()
      ? `Nota de la solicitud (${solicitud.solicitadoPorNombre}): ${solicitud.notas.trim()}`
      : null;

    if (existente) {
      if (modo === "sin_cambios") {
        cliente = existente;
      } else if (modo === "black_access") {
        cliente = await aplicarSolicitudAClienteExistente(
          existente.id,
          { etiqueta: "BLACK ACCESS", tipoMembresia: "3 Meses", notaSolicitud },
          permiso.usuario.nombre
        );
        // Black Access también manda la invitación a Skool (el vencimiento de
        // Skool ya quedó extendido arriba, por eso solo se marca el envío).
        try {
          await invitarASkool(cliente.email);
          cliente = await marcarSoloInvitacionSkoolEnviada(cliente.id);
        } catch (err) {
          avisoSkool = err instanceof Error ? err.message : "No se pudo enviar la invitación a Skool";
        }
        const fin = finAccesoConEtiqueta(cliente.fechaInscripcion, cliente.fechaRenovacion, cliente.etiqueta, cliente.etiquetaAsignadaEn);
        recordatorioKajabi =
          "Recuerda cambiar la fecha de fin de acceso en Kajabi" +
          (!fin.vitalicio && fin.fecha ? ` (nuevo fin de acceso: ${formatearFechaSkool(fin.fecha)}).` : ".");
      } else if (modo === "renovacion" || modo === "activar") {
        const clienteActualizado =
          modo === "renovacion"
            ? await renovarMembresia(existente.id, permiso.usuario.nombre)
            : await activarOfertaComoCompra(existente.id, permiso.usuario.nombre);
        const resultado = await otorgarAccesoKajabiYSkool(clienteActualizado);
        cliente = resultado.cliente;
        avisoKajabi = resultado.avisoKajabi;
        avisoSkool = resultado.avisoSkool;
        if (notaSolicitud) await agregarNotaAlPerfil(cliente.id, notaSolicitud);
        await agregarNota(
          cliente.id,
          `Solicitud aprobada por ${permiso.usuario.nombre} (enviada por ${solicitud.solicitadoPorNombre})`,
          permiso.usuario.nombre
        );
      } else {
        return NextResponse.json({ error: "Modo inválido" }, { status: 400 });
      }
    } else {
      const resultado = await altaCompletaCliente(
        {
          nombre: solicitud.nombre,
          email: solicitud.correoAcceso,
          telefono: solicitud.telefono,
          pais: solicitud.pais,
          evento: solicitud.evento,
          tipoMembresia: solicitud.tipoMembresia,
          etiqueta: solicitud.etiqueta,
          notas: [
            `Correo de pago: ${solicitud.correoPago} — solicitud enviada por ${solicitud.solicitadoPorNombre}, aprobada por ${permiso.usuario.nombre}.`,
            notaSolicitud,
          ]
            .filter(Boolean)
            .join("\n"),
          solicitadoPorNombre: solicitud.solicitadoPorNombre,
        },
        permiso.usuario.nombre
      );
      cliente = resultado.cliente;
      avisoKajabi = resultado.avisoKajabi;
      avisoSkool = resultado.avisoSkool;
      avisoGhl = resultado.avisoGhl;
    }

    const actualizada = await marcarSolicitudAprobada(id, cliente.id, permiso.usuario.nombre);

    // Si esta solicitud la creó sola la sincronización con VSL, le avisamos
    // que ya se le dio acceso — resiliente: si VSL falla, no bloquea la
    // aprobación (el cliente ya quedó creado bien de este lado de todos
    // modos), simplemente no se refleja del lado de ellos por ahora.
    let avisoVsl: string | null = null;
    if (solicitud.leadIdVsl) {
      try {
        await marcarAccesoDadoVsl(solicitud.leadIdVsl);
      } catch (err) {
        avisoVsl = err instanceof Error ? err.message : "No se pudo avisar a VSL";
      }
    }

    return NextResponse.json({ solicitud: actualizada, cliente, avisoKajabi, avisoSkool, avisoGhl, avisoVsl, recordatorioKajabi });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo crear el cliente";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
