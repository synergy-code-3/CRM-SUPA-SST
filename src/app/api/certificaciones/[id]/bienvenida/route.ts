import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { establecerMensajeBienvenidaCertificacion } from "@/lib/certificaciones";
import type { MensajeBienvenidaCertificacion } from "@/lib/certificaciones-tipos";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("gestionarCertificaciones");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    await establecerMensajeBienvenidaCertificacion(
      decodeURIComponent(id),
      body?.estado as MensajeBienvenidaCertificacion,
      permiso.usuario.nombre
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
