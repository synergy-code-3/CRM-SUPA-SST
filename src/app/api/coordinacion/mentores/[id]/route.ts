import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { actualizarMentor, cambiarMentorActivo, type RangoMentor } from "@/lib/coordinacion";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const body = await req.json();

  try {
    // Cambiar solo "activo" (botón de la lista) no toca el resto de campos
    // — a propósito, para no repetir el bug de la app vieja (editar
    // reactivaba sin querer a un mentor desactivado).
    if (typeof body?.activo === "boolean" && Object.keys(body).length === 1) {
      await cambiarMentorActivo(id, body.activo);
      return NextResponse.json({ ok: true });
    }

    const nombre = String(body?.nombre ?? "").trim();
    const rango = body?.rango as RangoMentor;
    if (!nombre || !rango) return NextResponse.json({ error: "Falta nombre o rango" }, { status: 400 });
    await actualizarMentor(id, { nombre, rango, especialidad: body?.especialidad, descripcion: body?.descripcion });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo actualizar el mentor";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
