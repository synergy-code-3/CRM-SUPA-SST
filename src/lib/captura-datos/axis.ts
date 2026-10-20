// Búsqueda de un cliente en Synergy Axis por teléfono. Solo servidor: el token nunca llega al navegador.
//
// Endpoint: GET <AXIS_TELEFONO_URL>?telefono=<10 dígitos> con Authorization: Bearer <AXIS_API_TOKEN>.
// 200 → { nombre, correo, coincidencias } · 404 → { error } (sin contacto) · 400 → teléfono inválido.
// Sin URL o token responde "no_configurado" y la interfaz no muestra nada de Axis.
import { z } from "zod";
import type { ContactoAxis, ResultadoAxis } from "./conciliacion";

const PARAMETRO = "telefono";
const TIMEOUT_MS = 8000;
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

// `coincidencias`: cuántos clientes de Axis tienen ese teléfono (nombre y correo son los del primero).
const Respuesta = z.object({
  nombre: z.string().nullish(),
  correo: z.string().nullish(),
  coincidencias: z.number().int().min(1),
});

export interface ConfigAxis {
  url?: string;
  token?: string;
  fetchFn?: typeof fetch;
}

/** La URL configurada, o null si no es válida (solo https; http únicamente en esta computadora). */
function urlConsulta(valor: string | undefined): URL | null {
  if (!valor) return null;
  try {
    const url = new URL(valor);
    return url.protocol === "https:" || (url.protocol === "http:" && LOCAL.has(url.hostname)) ? url : null;
  } catch {
    return null;
  }
}

const aContacto = (c: z.infer<typeof Respuesta>): ContactoAxis => ({
  nombre: (c.nombre ?? "").replace(/\s+/g, " ").trim(),
  correo: (c.correo ?? "").replace(/\s+/g, "").toLowerCase(),
});

export async function buscarPorTelefono(telefono: string, config: ConfigAxis = {}): Promise<ResultadoAxis> {
  const token = config.token ?? process.env.AXIS_API_TOKEN;
  const url = urlConsulta(config.url ?? process.env.AXIS_TELEFONO_URL);
  if (!url || !token) return { estado: "no_configurado" };
  url.searchParams.set(PARAMETRO, telefono);

  try {
    const res = await (config.fetchFn ?? fetch)(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      redirect: "error", // un 30x no debe llevar el token a otro destino
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return { estado: "no_encontrado" };
    if (!res.ok) {
      console.error(`axis: respondió ${res.status}`);
      return { estado: "no_disponible" };
    }
    const datos = Respuesta.safeParse(await res.json());
    if (!datos.success) {
      console.error("axis: la respuesta no tiene la forma esperada");
      return { estado: "no_disponible" };
    }
    return { estado: "encontrado", contacto: aContacto(datos.data), coincidencias: datos.data.coincidencias };
  } catch (err) {
    // Solo el tipo de error: el mensaje podría traer la URL o el token
    console.error(`axis: no se pudo consultar (${err instanceof Error ? err.name : "error"})`);
    return { estado: "no_disponible" };
  }
}
