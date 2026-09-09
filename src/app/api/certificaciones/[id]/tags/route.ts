import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { agregarTagsCertificacion, quitarTagCertificacion } from "@/lib/certificaciones";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("gestionarCertificaciones");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const body = await req.json();
  const tags: string[] = Array.isArray(body?.tags) ? body.tags : [];
  if (tags.length === 0) return NextResponse.json({ error: "Faltan tags" }, { status: 400 });

  try {
    await agregarTagsCertificacion(decodeURIComponent(id), tags, permiso.usuario.nombre);
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
  const tag = new URL(req.url).searchParams.get("tag");
  if (!tag) return NextResponse.json({ error: "Falta el tag" }, { status: 400 });

  try {
    await quitarTagCertificacion(decodeURIComponent(id), tag, permiso.usuario.nombre);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
