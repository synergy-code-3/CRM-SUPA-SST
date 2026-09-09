import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { agregarNotaCertificacion } from "@/lib/certificaciones";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("agregarNotaCertificaciones");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const body = await req.json();
  if (!body?.nota?.trim()) return NextResponse.json({ error: "La nota no puede estar vacía" }, { status: 400 });

  try {
    await agregarNotaCertificacion(decodeURIComponent(id), body.nota, permiso.usuario.nombre);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
