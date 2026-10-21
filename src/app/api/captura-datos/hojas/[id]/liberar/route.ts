import { NextRequest, NextResponse } from "next/server";
import { requerirHoja } from "@/lib/captura-datos/acceso";
import { requerirPermiso } from "@/lib/auth";
import { liberarHoja } from "@/lib/captura-datos/db";
import { respuestaError } from "@/lib/captura-datos/api";

// Quien tenga acceso al evento de la hoja puede liberarla (liberarHoja solo suelta bloqueos propios).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    await requerirHoja(permiso.usuario, id);
    await liberarHoja(id, permiso.usuario.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respuestaError(err, "captura-datos/hojas/[id]/liberar POST");
  }
}
