import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { altaCompletaCliente } from "@/lib/alta-cliente";
import { marcarSolicitudAprobada, obtenerSolicitud } from "@/lib/solicitudes";
import { marcarAccesoDadoVsl } from "@/lib/vsl-soporte";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("revisarSolicitudes");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const solicitud = await obtenerSolicitud(id);
  if (!solicitud) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  if (solicitud.estado !== "pendiente") {
    return NextResponse.json({ error: "Esta solicitud ya fue revisada" }, { status: 400 });
  }

  try {
    // correoAcceso es el identificador del cliente en el CRM/Kajabi/Skool;
    // correoPago queda solo como referencia en las notas, para conciliar el
    // pago si hace falta.
    const { cliente, avisoKajabi, avisoSkool, avisoGhl } = await altaCompletaCliente(
      {
        nombre: solicitud.nombre,
        email: solicitud.correoAcceso,
        telefono: solicitud.telefono,
        pais: solicitud.pais,
        evento: solicitud.evento,
        tipoMembresia: solicitud.tipoMembresia,
        notas: `Correo de pago: ${solicitud.correoPago} — solicitud enviada por ${solicitud.solicitadoPorNombre}, aprobada por ${permiso.usuario.nombre}.`,
      },
      permiso.usuario.nombre
    );

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

    return NextResponse.json({ solicitud: actualizada, cliente, avisoKajabi, avisoSkool, avisoGhl, avisoVsl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo crear el cliente";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
