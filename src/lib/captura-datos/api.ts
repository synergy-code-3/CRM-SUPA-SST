// Utilidades de las rutas de la API: leer y validar el cuerpo, y responder errores sin revelar detalles internos.
import { NextResponse } from "next/server";
import type { z } from "zod";

import { ErrorPeticion } from "./errores";

export { ErrorPeticion };

/** Lee el cuerpo como JSON y lo valida. JSON mal formado o datos que no cumplen el esquema → 400. */
export async function leerJson<T extends z.ZodType>(req: Request, esquema: T, maxBytes = 1_000_000): Promise<z.infer<T>> {
  const texto = await req.text();
  if (texto.length > maxBytes) throw new ErrorPeticion(413, "La petición es demasiado grande.");
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new ErrorPeticion(400, "La petición no es JSON válido.");
  }
  const r = esquema.safeParse(datos);
  if (!r.success) {
    const campo = r.error.issues[0]?.path.join(".") || "datos";
    throw new ErrorPeticion(400, `Datos inválidos (${campo}).`);
  }
  return r.data;
}

/** Respuesta de error: solo los `ErrorPeticion` muestran su mensaje; de cualquier otro error el detalle va a la consola del servidor y al navegador solo llega un mensaje genérico. */
export function respuestaError(err: unknown, contexto: string) {
  if (err instanceof ErrorPeticion) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error(`${contexto}:`, err);
  return NextResponse.json({ error: "Error interno del servidor. Intenta de nuevo; si sigue, avisa a soporte." }, { status: 500 });
}
