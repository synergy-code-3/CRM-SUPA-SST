import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { obtenerGiras } from "@/lib/coordinacion-sheets";

export async function GET() {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  try {
    const giras = await obtenerGiras();
    return NextResponse.json({ giras });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudieron cargar las giras";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
