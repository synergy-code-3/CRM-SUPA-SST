import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { reemplazarAsignaciones } from "@/lib/captura-datos/db";
import { leerJson, respuestaError } from "@/lib/captura-datos/api";
import { putAsignaciones } from "@/lib/captura-datos/validacion";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    const b = await leerJson(req, putAsignaciones);
    await reemplazarAsignaciones(id, b.usuariosAsignados);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respuestaError(err, "captura-datos/eventos/[id]/asignaciones PUT");
  }
}
