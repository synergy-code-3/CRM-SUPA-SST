import fs from "node:fs/promises";
import path from "node:path";

// Preguntas que no calzan con ningún tema fijo de asistente-abeja-datos.ts
// (esas son de uso del CRM, con respuestas ya escritas a mano) pasan por
// aquí — preguntas de soporte/ventas sobre los productos de Sinergéticos
// (precios, políticas, vigencias), donde una base de 700+ líneas con
// matices por región no se puede cubrir bien con coincidencia de palabras
// clave. Se le da el .md completo como contexto a Claude en cada pregunta
// (no hay RAG/embeddings — el documento cabe entero en el contexto).
const RUTA_BASE_CONOCIMIENTO = path.join(process.cwd(), "BASE_CONOCIMIENTO_SINERGETICOS_BOT.md");

let baseConocimientoCache: string | null = null;

async function cargarBaseConocimiento(): Promise<string> {
  if (baseConocimientoCache) return baseConocimientoCache;
  baseConocimientoCache = await fs.readFile(RUTA_BASE_CONOCIMIENTO, "utf-8");
  return baseConocimientoCache;
}

export type MensajeHistorial = { role: "user" | "assistant"; content: string };

// Vía OpenRouter (no Anthropic directo) — API estilo OpenAI (chat
// completions), un solo endpoint que da acceso a varios proveedores/modelos
// con una misma key. OPENROUTER_MODEL es configurable sin tocar código, por
// si el modelo default deja de estar disponible o se quiere cambiar.
// `historial` = los últimos mensajes de la MISMA conversación (ver
// AsistenteAbeja.tsx) — sin esto, cada pregunta se respondía aislada, sin
// memoria de lo que ya se había dicho.
export async function responderConIA(pregunta: string, historial: MensajeHistorial[] = []): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Falta configurar OPENROUTER_API_KEY");
  const modelo = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

  const baseConocimiento = await cargarBaseConocimiento();
  const system = `Eres Abejita, la asistente interna de soporte del equipo de Sinergéticos (Club Sinergético y productos relacionados). Quien te pregunta es parte del equipo (ventas/soporte/coordinación), no un cliente final.

Responde SOLO con base en la siguiente base de conocimiento — nunca inventes precios, fechas, políticas, enlaces ni garantías que no estén ahí. Si la base no cubre la pregunta o hay una contradicción entre fuentes, dilo con claridad y sugiere escalar con el responsable humano en vez de adivinar. Sigue las reglas obligatorias de la sección 4.2 del documento. Responde en español, breve y directo — esto se muestra en una ventana de chat chica, no es un correo.

BASE DE CONOCIMIENTO:
${baseConocimiento}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      // OpenRouter los pide para identificar la app en su dashboard — no
      // afecta la respuesta, solo sus métricas/rankings.
      "HTTP-Referer": "https://crm-sinergetico.vercel.app",
      // Headers HTTP deben ser ASCII puro (fetch truena con caracteres como
      // "é"/"—") — nombre en texto plano, sin acentos ni guion largo.
      "X-Title": "CRM Club Sinergetico - Abejita",
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 600,
      messages: [{ role: "system", content: system }, ...historial, { role: "user", content: pregunta }],
    }),
  });

  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new Error(`OpenRouter respondió ${res.status}: ${texto.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const texto = data.choices?.[0]?.message?.content?.trim();
  if (!texto) throw new Error("Respuesta vacía de OpenRouter");
  return texto;
}

const PALABRAS_VACIAS = new Set([
  "de", "la", "el", "en", "y", "a", "que", "los", "las", "un", "una", "con", "para", "por", "se", "su", "del",
  "al", "es", "como", "cual", "cuales", "cuanto", "cuanta", "mas", "lo", "si", "no", "tu", "te", "me",
]);

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Respaldo sin IA: si OpenRouter falla (sin internet, sin saldo, key mala,
// etc.), en vez de rendirse directo al "no encontré nada" se busca la
// sección del .md con más palabras clave de la pregunta en común — el mismo
// documento que se le da de contexto a la IA, pero recorrido a mano. No es
// tan bueno como una respuesta real de IA (no entiende sinónimos ni
// paráfrasis), pero es mejor que nada cuando la IA está caída.
export async function buscarEnBaseConocimiento(pregunta: string): Promise<string | null> {
  const palabrasClave = normalizar(pregunta)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 2 && !PALABRAS_VACIAS.has(p));
  if (palabrasClave.length === 0) return null;

  const base = await cargarBaseConocimiento();
  // Por encabezado (## / ###) — una unidad con contexto completo, no una
  // línea suelta sin el resto de la sección.
  const secciones = base.split(/\n(?=#{1,3} )/);

  let mejor: { texto: string; puntaje: number } | null = null;
  for (const seccion of secciones) {
    const normalizada = normalizar(seccion);
    const puntaje = palabrasClave.reduce((acc, p) => acc + (normalizada.includes(p) ? 1 : 0), 0);
    if (puntaje > 0 && (!mejor || puntaje > mejor.puntaje)) mejor = { texto: seccion, puntaje };
  }
  // Umbral: al menos la mitad de las palabras clave de la pregunta deben
  // aparecer en la sección — si no, es más probable que sea ruido que una
  // respuesta de verdad relacionada.
  if (!mejor || mejor.puntaje < Math.ceil(palabrasClave.length / 2)) return null;

  return `(Sin conexión con la IA en este momento — esto es un fragmento encontrado por palabras clave en la base de conocimiento, puede no responder exactamente tu pregunta)\n\n${mejor.texto.trim().slice(0, 800)}`;
}
