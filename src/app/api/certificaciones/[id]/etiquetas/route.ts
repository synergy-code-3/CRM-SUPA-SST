import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { agregarEtiquetasCertificacion, quitarEtiquetaCertificacion } from "@/lib/certificaciones";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("gestionarCertificaciones");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const body = await req.json();
  const etiquetas: string[] = Array.isArray(body?.etiquetas) ? body.etiquetas : [];
  if (etiquetas.length === 0) return NextResponse.json({ error: "Faltan etiquetas" }, { status: 400 });

  try {
    await agregarEtiquetasCertificacion(decodeURIComponent(id), etiquetas, permiso.usuario.nombre);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("gestionarCertificaciones");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const etiqueta = new URL(req.url).searchParams.get("etiqueta");
  if (!etiqueta) return NextResponse.json({ error: "Falta la etiqueta" }, { status: 400 });

  try {
    await quitarEtiquetaCertificacion(decodeURIComponent(id), etiqueta, permiso.usuario.nombre);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
