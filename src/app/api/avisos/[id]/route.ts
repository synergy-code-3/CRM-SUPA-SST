import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { editarAviso, eliminarAviso } from "@/lib/avisos";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("gestionarAvisos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const body = await req.json();
  const titulo = String(body?.titulo ?? "").trim();
  const mensaje = String(body?.mensaje ?? "").trim();
  if (!titulo || !mensaje) {
    return NextResponse.json({ error: "Título y mensaje son obligatorios" }, { status: 400 });
  }

  const aviso = await editarAviso(id, titulo, mensaje);
  return NextResponse.json({ aviso });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("gestionarAvisos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  await eliminarAviso(id);
  return NextResponse.json({ ok: true });
}
