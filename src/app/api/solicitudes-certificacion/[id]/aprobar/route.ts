import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { crearClienteCertificacion, enviarInvitacionCertificacion, obtenerClienteCertificacion } from "@/lib/certificaciones";
import { invitarASkoolCertificaciones } from "@/lib/skool";
import { marcarSolicitudCertificacionAprobada, obtenerSolicitudCertificacion } from "@/lib/solicitudes-certificacion";
import type { RegionCertificacion } from "@/lib/certificaciones-tipos";

// A diferencia del Club (que tiene varios modos posibles al aprobar sobre un
// correo que ya es cliente — renovación/black access/activar/sin cambios),
// aquí se corta simple: si ya es cliente de Certificaciones, la solicitud se
// aprueba sola enlazándola a ese cliente ya existente, sin crear uno nuevo
// ni volver a mandar la invitación a Skool (ya la tiene). Antes esto
// devolvía error pidiendo aplicar el cambio a mano — Samuel pidió quitar
// ese paso manual, el mismo auto-approve que ya existe cuando el cliente se
// da de alta DESPUÉS de la solicitud (ver crearClienteCertificacion).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("revisarSolicitudesCertificacion");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const solicitud = await obtenerSolicitudCertificacion(id);
  if (!solicitud) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  if (solicitud.estado !== "pendiente") {
    return NextResponse.json({ error: "Esta solicitud ya fue revisada" }, { status: 400 });
  }

  try {
    const existente = await obtenerClienteCertificacion(solicitud.correo);
    if (existente) {
      const actualizada = await marcarSolicitudCertificacionAprobada(id, existente.id, permiso.usuario.nombre);
      return NextResponse.json({ solicitud: actualizada, cliente: existente, yaEraCliente: true });
    }

    const notaSolicitud = solicitud.notas?.trim()
      ? `Nota de la solicitud (${solicitud.solicitadoPorNombre}): ${solicitud.notas.trim()}`
      : null;

    const cliente = await crearClienteCertificacion(
      {
        nombre: solicitud.nombre,
        email: solicitud.correo,
        telefono: solicitud.telefono,
        region: solicitud.region as RegionCertificacion | null,
        monto: solicitud.monto,
        etiquetas: solicitud.etiqueta ? [solicitud.etiqueta] : [],
        notas: [
          `Solicitud enviada por ${solicitud.solicitadoPorNombre}, aprobada por ${permiso.usuario.nombre}.`,
          notaSolicitud,
        ]
          .filter(Boolean)
          .join("\n"),
      },
      permiso.usuario.nombre,
      permiso.usuario.rol
    );

    const actualizada = await marcarSolicitudCertificacionAprobada(id, cliente.id, permiso.usuario.nombre);

    // Al aprobar también se manda la invitación a Skool. Si Skool falla, el
    // cliente se queda en NUEVO (para reintentar con "Enviar invitación") y
    // se avisa; la aprobación no se pierde.
    let avisoSkool: string | null = null;
    let clienteFinal = cliente;
    try {
      await invitarASkoolCertificaciones(cliente.email ?? solicitud.correo);
      await enviarInvitacionCertificacion(cliente.id, permiso.usuario.nombre);
      clienteFinal = (await obtenerClienteCertificacion(cliente.id)) ?? cliente;
    } catch (err) {
      avisoSkool = err instanceof Error ? err.message : "No se pudo enviar la invitación a Skool";
    }

    return NextResponse.json({ solicitud: actualizada, cliente: clienteFinal, avisoSkool });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo crear el cliente";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
