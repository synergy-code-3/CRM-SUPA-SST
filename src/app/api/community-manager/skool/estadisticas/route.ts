import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { obtenerEstadisticasSkool } from "@/lib/community-manager";

export async function GET() {
  const permiso = await requerirPermiso("verCommunityManager");
  if (!permiso.ok) return permiso.respuesta;

  try {
    const estadisticas = await obtenerEstadisticasSkool();
    return NextResponse.json({ estadisticas });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudieron cargar las estadísticas";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
