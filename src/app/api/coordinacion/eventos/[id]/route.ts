import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { actualizarEvento, eliminarEvento } from "@/lib/coordinacion";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const body = await req.json();
  const titulo = String(body?.titulo ?? "").trim();
  const fecha = String(body?.fecha ?? "");
  if (!titulo || !fecha) return NextResponse.json({ error: "Falta título o fecha" }, { status: 400 });

  try {
    await actualizarEvento(id, {
      titulo,
      fecha,
      color: body?.color,
      horaInicio: body?.horaInicio,
      horaFin: body?.horaFin,
      enlace: body?.enlace,
      invitados: body?.invitados,
      notas: body?.notas,
      descripcion: body?.descripcion,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo actualizar el evento";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    await eliminarEvento(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo eliminar el evento";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
