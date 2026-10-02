import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { obtenerEstadisticas, PLATAFORMAS_VALIDAS, type Plataforma } from "@/lib/community-manager";

export async function GET(req: NextRequest) {
  const permiso = await requerirPermiso("verCommunityManager");
  if (!permiso.ok) return permiso.respuesta;

  const plataformaParam = req.nextUrl.searchParams.get("plataforma");
  const plataforma = PLATAFORMAS_VALIDAS.includes(plataformaParam as Plataforma) ? (plataformaParam as Plataforma) : null;

  try {
    const estadisticas = await obtenerEstadisticas(plataforma);
    return NextResponse.json({ estadisticas });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudieron cargar las estadísticas";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
