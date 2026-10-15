import { NextRequest, NextResponse } from "next/server";
import { obtenerUsuarioActual } from "@/lib/auth";
import { buscarEnBaseConocimiento, responderConIA, type MensajeHistorial } from "@/lib/asistente-abeja-ia";

// Disponible para cualquier usuario logueado (no requiere un permiso
// especial) — la abejita ya es visible para todos los roles.
export async function POST(req: NextRequest) {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const pregunta = String(body?.pregunta ?? "").trim();
  if (!pregunta) return NextResponse.json({ error: "Falta la pregunta" }, { status: 400 });

  const historial: MensajeHistorial[] = Array.isArray(body?.historial)
    ? body.historial.filter(
        (m: unknown): m is MensajeHistorial =>
          !!m &&
          typeof m === "object" &&
          ((m as MensajeHistorial).role === "user" || (m as MensajeHistorial).role === "assistant") &&
          typeof (m as MensajeHistorial).content === "string"
      )
    : [];

  try {
    const respuesta = await responderConIA(pregunta, historial);
    return NextResponse.json({ respuesta });
  } catch (errIA) {
    // La IA falló (sin internet, sin saldo, key mala, etc.) — antes de
    // rendirse del todo, se busca por palabras clave dentro de la misma
    // base de conocimiento (ver buscarEnBaseConocimiento).
    try {
      const respaldo = await buscarEnBaseConocimiento(pregunta);
      if (respaldo) return NextResponse.json({ respuesta: respaldo });
    } catch {
      // si ni el respaldo local funciona, sigue al error de abajo
    }
    const message = errIA instanceof Error ? errIA.message : "No se pudo generar la respuesta";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
