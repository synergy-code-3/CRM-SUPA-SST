import { NextRequest, NextResponse } from "next/server";
import { requerirEvento } from "@/lib/captura-datos/acceso";
import { requerirPermiso } from "@/lib/auth";
import { tomarHojaBody } from "@/lib/captura-datos/validacion";
import { tomarHojaLibre } from "@/lib/captura-datos/db";
import { leerJson, respuestaError } from "@/lib/captura-datos/api";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    await requerirEvento(permiso.usuario, id);
    const { estatus } = await leerJson(req, tomarHojaBody);
    const hoja = await tomarHojaLibre(id, permiso.usuario.id, estatus);
    return NextResponse.json({ hoja: hoja ?? null });
  } catch (err) {
    return respuestaError(err, "captura-datos/eventos/[id]/tomar-hoja POST");
  }
}
