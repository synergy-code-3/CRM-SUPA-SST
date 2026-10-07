import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { obtenerGrupos } from "@/lib/coordinacion-sheets";

export async function GET() {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  try {
    const grupos = await obtenerGrupos();
    return NextResponse.json({ grupos });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudieron cargar los grupos";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
