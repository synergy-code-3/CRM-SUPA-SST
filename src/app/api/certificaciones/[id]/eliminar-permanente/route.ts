import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { eliminarClienteCertificacionPermanente, obtenerClienteCertificacion } from "@/lib/certificaciones";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("gestionarCertificaciones");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const clienteId = decodeURIComponent(id);
  try {
    const cliente = await obtenerClienteCertificacion(clienteId);
    if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    if (!cliente.eliminado) {
      return NextResponse.json({ error: "Solo se puede borrar definitivo desde la papelera" }, { status: 400 });
    }
    await eliminarClienteCertificacionPermanente(clienteId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
