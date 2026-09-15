import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { marcarSolicitudCorreoInvalido, obtenerSolicitud } from "@/lib/solicitudes";

// Rechazo específico: el correo de la solicitud está mal. A diferencia de
// .../rechazar (nota opcional, cierra la solicitud), aquí la nota SÍ es
// obligatoria — es el mensaje que ve el vendedor en la ventana emergente
// que le llega — y la solicitud queda reabrible por él desde "Solicitudes
// inválidas" (ver .../reenviar).
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
  const nota = typeof body?.nota === "string" ? body.nota.trim() : "";
  if (!nota) {
    return NextResponse.json({ error: "Falta explicar qué está mal con el correo" }, { status: 400 });
  }

  const actualizada = await marcarSolicitudCorreoInvalido(id, nota, {
    id: permiso.usuario.id,
    nombre: permiso.usuario.nombre,
  });
  return NextResponse.json({ solicitud: actualizada });
}
