import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { tomarHojaLibre } from "@/lib/captura-datos/db";
import { respuestaError } from "@/lib/captura-datos/api";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    const hoja = await tomarHojaLibre(id, permiso.usuario.id);
    return NextResponse.json({ hoja: hoja ?? null });
  } catch (err) {
    return respuestaError(err, "captura-datos/eventos/[id]/tomar-hoja POST");
  }
}
