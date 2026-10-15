import { NextRequest, NextResponse } from "next/server";
import { obtenerUsuarioActual } from "@/lib/auth";
import { responderConIA } from "@/lib/asistente-abeja-ia";

// Disponible para cualquier usuario logueado (no requiere un permiso
// especial) — la abejita ya es visible para todos los roles.
export async function POST(req: NextRequest) {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const pregunta = String(body?.pregunta ?? "").trim();
  if (!pregunta) return NextResponse.json({ error: "Falta la pregunta" }, { status: 400 });

  try {
    const respuesta = await responderConIA(pregunta);
    return NextResponse.json({ respuesta });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo generar la respuesta";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
