import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { listarMentores, crearMentor, type RangoMentor } from "@/lib/coordinacion";

export async function GET() {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  try {
    const mentores = await listarMentores();
    return NextResponse.json({ mentores });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudieron cargar los mentores";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  const body = await req.json();
  const nombre = String(body?.nombre ?? "").trim();
  const rango = body?.rango as RangoMentor;
  if (!nombre || !rango) return NextResponse.json({ error: "Falta nombre o rango" }, { status: 400 });

  try {
    const { id } = await crearMentor({ nombre, rango, especialidad: body?.especialidad, descripcion: body?.descripcion });
    return NextResponse.json({ id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo crear el mentor";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
