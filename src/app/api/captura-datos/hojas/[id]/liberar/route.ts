import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { liberarHoja } from "@/lib/captura-datos/db";
import { respuestaError } from "@/lib/captura-datos/api";

// Cualquiera que vea Captura de Datos puede liberar una hoja (hoy solo
// admins entran a la sección, así que no hace falta restringirlo más).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    await liberarHoja(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respuestaError(err, "captura-datos/hojas/[id]/liberar POST");
  }
}
