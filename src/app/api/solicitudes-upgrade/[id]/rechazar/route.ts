import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { marcarSolicitudUpgradeRechazada, obtenerSolicitudUpgrade } from "@/lib/solicitudes-upgrade";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("editarCliente");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const nota = typeof body?.nota === "string" ? body.nota.trim() : null;

  try {
    const solicitud = await obtenerSolicitudUpgrade(id);
    if (!solicitud) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
    if (solicitud.estado !== "pendiente") {
      return NextResponse.json({ error: "Esta solicitud ya fue revisada" }, { status: 400 });
    }

    const actualizada = await marcarSolicitudUpgradeRechazada(id, nota || null, permiso.usuario.nombre);
    return NextResponse.json({ solicitud: actualizada });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo rechazar el upgrade";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
