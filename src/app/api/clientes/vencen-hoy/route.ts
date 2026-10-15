import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { listarClientesQueVencenHoy } from "@/lib/db";

// Mismo permiso que revocar acceso (solo admin) — esta lista solo existe
// para alimentar esa acción masiva, ver revocar-acceso-masivo/route.ts.
export async function GET() {
  const permiso = await requerirPermiso("revocarAccesoCliente");
  if (!permiso.ok) return permiso.respuesta;

  try {
    const clientes = await listarClientesQueVencenHoy();
    return NextResponse.json({ clientes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo calcular quién vence hoy";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
