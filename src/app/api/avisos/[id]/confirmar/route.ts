import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { confirmarAviso } from "@/lib/avisos";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verAvisos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  await confirmarAviso(id, permiso.usuario.id, permiso.usuario.nombre);
  return NextResponse.json({ ok: true });
}
