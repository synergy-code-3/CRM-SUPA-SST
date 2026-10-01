import { timingSafeEqual } from "crypto";
import { registrarEnvioLanding } from "@/lib/landing";

// Recibe los envíos del popup de la landing de bienvenida (embebido en
// GHL): los guarda en landing_registros y, si encuentra al cliente por
// correo o por teléfono, marca en su perfil que ya entró — ver
// registrarEnvioLanding (lib/landing.ts). Respuesta siempre neutra (no
// revela si la persona existe o no en el CRM).
//
// Variables de entorno: LANDING_PUBLIC_TOKEN, LANDING_ALLOWED_ORIGINS (ver
// .env.example).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function origenPermitido(req: Request): string | null {
  const origin = req.headers.get("origin") || "";
  const lista = (process.env.LANDING_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return lista.includes(origin) ? origin : null;
}

function cors(req: Request): Record<string, string> {
  const origin = origenPermitido(req);
  return origin
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        Vary: "Origin",
      }
    : {};
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(req) },
  });
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) });
}

// Límite de intentos en memoria — alcanza para un popup normal; en
// serverless cada instancia lleva su propio contador, así que es un
// freno best-effort contra abuso, no una garantía dura.
const intentos = new Map<string, { n: number; desde: number }>();
const VENTANA_MS = 10 * 60 * 1000;
const MAX_INTENTOS = 15;

function limitado(ip: string): boolean {
  const ahora = Date.now();
  const r = intentos.get(ip);
  if (!r || ahora - r.desde > VENTANA_MS) {
    intentos.set(ip, { n: 1, desde: ahora });
    return false;
  }
  r.n += 1;
  return r.n > MAX_INTENTOS;
}

function tokenValido(recibido: unknown): boolean {
  const esperado = process.env.LANDING_PUBLIC_TOKEN || "";
  if (!esperado || typeof recibido !== "string") return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

export async function POST(req: Request) {
  if (!origenPermitido(req)) return json(req, { ok: false }, 403);

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "desconocida";
  if (limitado(ip)) return json(req, { ok: false }, 429);

  // El popup manda JSON como text/plain para evitar el preflight de CORS.
  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 5000) return json(req, { ok: false }, 413);
    body = JSON.parse(raw);
  } catch {
    return json(req, { ok: false }, 400);
  }

  const datos = body as Record<string, unknown>;
  if (!tokenValido(datos?.token)) return json(req, { ok: false }, 401);

  const nombre = String(datos?.nombre ?? "").trim().slice(0, 120);
  const email = String(datos?.email ?? "").trim().toLowerCase().slice(0, 200);
  const telefono = String(datos?.telefono ?? "").trim().slice(0, 40);
  const telDigitos = telefono.replace(/\D/g, "");

  if (nombre.length < 2 || !emailOk(email) || telDigitos.length < 10) {
    return json(req, { ok: false, error: "datos_invalidos" }, 422);
  }

  try {
    await registrarEnvioLanding({
      nombre,
      email,
      telefono,
      pagina: String(datos?.pagina ?? "").slice(0, 300) || null,
      ip,
      userAgent: (req.headers.get("user-agent") || "").slice(0, 300) || null,
    });
  } catch (err) {
    console.error("webhook landing: error registrando envío", err);
    return json(req, { ok: false }, 500);
  }

  return json(req, { ok: true });
}
