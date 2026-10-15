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

// Vía OpenRouter (no Anthropic directo) — API estilo OpenAI (chat
// completions), un solo endpoint que da acceso a varios proveedores/modelos
// con una misma key. OPENROUTER_MODEL es configurable sin tocar código, por
// si el modelo default deja de estar disponible o se quiere cambiar.
export async function responderConIA(pregunta: string): Promise<string> {
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
      messages: [
        { role: "system", content: system },
        { role: "user", content: pregunta },
      ],
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
