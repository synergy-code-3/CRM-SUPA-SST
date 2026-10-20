// Utilidades de las rutas de la API: leer y validar el cuerpo, y responder errores sin revelar detalles internos.
import { NextResponse } from "next/server";
import type { z } from "zod";

/** Error de la petición (datos inválidos, demasiado grande…): se muestra tal cual al usuario. */
export class ErrorPeticion extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

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

const ERROR_INTERNO = /^(TypeError|ReferenceError|SyntaxError|RangeError|EvalError|URIError)$/;
const RUTA_INTERNA = /(\/home\/|\/tmp\/|\/Users\/|\/var\/|[A-Z]:\\|node_modules|\.next\/)/;

/** Mensaje apto para el usuario: los errores de programación o con rutas internas se ocultan. */
export function mensajeSeguro(err: unknown): string {
  const e = err as Error | undefined;
  if (!e?.message || ERROR_INTERNO.test(e.name) || RUTA_INTERNA.test(e.message)) {
    return "Error interno del servidor. Revisa la consola donde corre la app.";
  }
  return e.message;
}

/** Respuesta de error: el detalle completo va a la consola del servidor; al navegador, solo el mensaje seguro. */
export function respuestaError(err: unknown, contexto: string) {
  if (err instanceof ErrorPeticion) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error(`${contexto}:`, err);
  const mensaje = mensajeSeguro(err);
  return NextResponse.json({ error: mensaje }, { status: /inválid/i.test(mensaje) ? 400 : 500 });
}
