import { NextRequest, NextResponse } from "next/server";
import { requerirEvento } from "@/lib/captura-datos/acceso";
import { requerirPermiso } from "@/lib/auth";
import { listarAsignaciones, reemplazarAsignaciones } from "@/lib/captura-datos/db";
import { leerJson, respuestaError } from "@/lib/captura-datos/api";
import { putAsignaciones } from "@/lib/captura-datos/validacion";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    await requerirEvento(permiso.usuario, id);
    return NextResponse.json({ usuariosAsignados: await listarAsignaciones(id) });
  } catch (err) {
    return respuestaError(err, "captura-datos/eventos/[id]/asignaciones GET");
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  if (permiso.usuario.rol !== "admin") return NextResponse.json({ error: "No tienes permiso para esto" }, { status: 403 });

  const { id } = await params;
  try {
    const b = await leerJson(req, putAsignaciones);
    await reemplazarAsignaciones(id, b.usuariosAsignados);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respuestaError(err, "captura-datos/eventos/[id]/asignaciones PUT");
  }
}
