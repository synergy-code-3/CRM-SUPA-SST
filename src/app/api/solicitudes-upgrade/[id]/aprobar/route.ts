import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { aprobarUpgradeMembresia } from "@/lib/db";
import { marcarSolicitudUpgradeAprobada, obtenerSolicitudUpgrade } from "@/lib/solicitudes-upgrade";

// Mismo permiso que editar el cliente directo (en el Club, solo admin) — es
// quien de verdad puede cambiarle la membresía, la solicitud es solo el
// aviso con el comprobante adjunto.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("editarCliente");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;

  try {
    const solicitud = await obtenerSolicitudUpgrade(id);
    if (!solicitud) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
    if (solicitud.estado !== "pendiente") {
      return NextResponse.json({ error: "Esta solicitud ya fue revisada" }, { status: 400 });
    }

    const cliente = await aprobarUpgradeMembresia(solicitud.clienteId, permiso.usuario.nombre);
    await marcarSolicitudUpgradeAprobada(id, permiso.usuario.nombre);
    return NextResponse.json({ cliente });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo aprobar el upgrade";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
