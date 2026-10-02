import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { obtenerRecientesCommunityManager } from "@/lib/community-manager";

export async function GET() {
  const permiso = await requerirPermiso("verCommunityManager");
  if (!permiso.ok) return permiso.respuesta;

  try {
    const recientes = await obtenerRecientesCommunityManager();
    return NextResponse.json({ recientes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudieron cargar los recientes";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
