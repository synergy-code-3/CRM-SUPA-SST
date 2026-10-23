import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { aprobarSolicitudRenovacionExterna } from "@/lib/solicitudes-renovacion";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("revisarSolicitudes");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    await aprobarSolicitudRenovacionExterna(id, permiso.usuario.nombre);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
