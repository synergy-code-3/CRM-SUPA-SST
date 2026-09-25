import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { establecerAccesosCertificacion } from "@/lib/certificaciones";
import type { Accesos } from "@/lib/types";

// Body: { accesos } guarda los accesos editados a mano; { restablecer: true }
// los devuelve al cálculo automático por región.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("gestionarCertificaciones");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!body?.restablecer && !body?.accesos) {
    return NextResponse.json({ error: "Faltan los accesos" }, { status: 400 });
  }
  try {
    await establecerAccesosCertificacion(
      decodeURIComponent(id),
      body.restablecer ? null : (body.accesos as Accesos),
      permiso.usuario.nombre
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
