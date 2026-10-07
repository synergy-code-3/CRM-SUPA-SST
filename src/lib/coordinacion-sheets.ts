// Giras y Grupos de Comunidad — se leen en vivo del mismo Google Sheet /
// Apps Script que ya usaba la app vieja de Coordinación. Antes esto se
// pedía desde el navegador de cada usuario con JSONP/proxies CORS; aquí lo
// pide el propio servidor del CRM (sin esos problemas) y entrega los datos
// ya parseados. El parseo (regex de fechas en español, clasificación de
// filas) está portado tal cual del `index.html` original — es heurístico
// porque la hoja de origen tiene texto libre, no tiene arreglo sin cambiar
// la hoja misma.

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxdetNkJ8vM6zjGXNbB0HHz2IprhzFmo6zrQkC2OyxCdeKJtCJ9LtwUY_70sqk5JcPF/exec";

// El Sheet no cambia a cada rato — sin esto, cada vez que alguien entra a
// Giras/Grupos el servidor vuelve a pedirle al Apps Script (que es lento,
// unos segundos). Caché en memoria del proceso, 10 min — mismo TTL que ya
// usaba la app vieja (SHEET_TTL) para su caché en localStorage.
const CACHE_TTL_MS = 10 * 60 * 1000;
const cacheEnMemoria = new Map<string, { datos: unknown; expiraEn: number }>();

async function conCache<T>(clave: string, obtener: () => Promise<T>): Promise<T> {
  const cacheado = cacheEnMemoria.get(clave);
  if (cacheado && Date.now() < cacheado.expiraEn) return cacheado.datos as T;
  const datos = await obtener();
  cacheEnMemoria.set(clave, { datos, expiraEn: Date.now() + CACHE_TTL_MS });
  return datos;
}

async function obtenerFilasSheet(tab: "giras" | "grupos"): Promise<string[][]> {
  const res = await fetch(`${APPS_SCRIPT_URL}?tab=${tab}`, { signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer la hoja de ${tab} (${res.status})`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`Respuesta inesperada de la hoja de ${tab}`);
  return data as string[][];
}

function esURL(v: string | undefined): boolean {
  return /https?:\/\//i.test(v ?? "");
}

function esBasura(v: string | undefined): boolean {
  const s = (v ?? "").trim();
  return !s || s === "000" || s === "," || /^\d+$/.test(s) || esURL(s);
}

// --- Giras -----------------------------------------------------------

const MESES: Record<string, number> = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
  jan: 0, apr: 3, aug: 7, dec: 11,
};

// Cascada de formatos de fecha en español, de más a menos específico —
// igual que `giDate()` del original. "DD de MES" sin año solo se acepta si
// cae en una ventana de -60/+120 días desde hoy, para no mezclar años.
function parsearFechaGira(raw: string | undefined): Date | null {
  if (!raw) return null;
  let m = raw.match(/(\d+)[,\s\d]*\s+([A-Za-záéíóú]{3,})\s+(\d{4})/i);
  if (m) {
    const ms = MESES[m[2].toLowerCase().slice(0, 3)];
    if (ms !== undefined) return new Date(Number(m[3]), ms, Number(m[1]));
  }
  m = raw.match(/(\d{1,2})\s+de\s+([A-Za-záéíóú]{3,})/i);
  if (m) {
    const ms = MESES[m[2].toLowerCase().slice(0, 3)];
    if (ms !== undefined) {
      const ahora = new Date();
      const d = new Date(ahora.getFullYear(), ms, Number(m[1]));
      const diffDias = (d.getTime() - ahora.getTime()) / 86400000;
      if (diffDias >= -60 && diffDias <= 120) return d;
    }
  }
  m = raw.match(/\b(\d{1,2})\s+([A-Za-záéíóú]{3,})/i);
  if (m) {
    const ms = MESES[m[2].toLowerCase().slice(0, 3)];
    if (ms !== undefined) return new Date(new Date().getFullYear(), ms, Number(m[1]));
  }
  m = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}

function fechaISO(d: Date | null): string | null {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Quita la parte de horario ("10 AM", "6PM // 8PM") del texto de fecha, para
// mostrar solo la fecha en la lista — igual que `giDisp()` del original.
function fechaParaMostrar(raw: string | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/\s*\d{1,2}\s*(?:am|pm)(?:\s*(?:\/\/|\/)\s*\d{1,2}\s*(?:am|pm))?/gi, "")
    .replace(/\s*\/\/\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function horarioGira(raw: string | undefined): string {
  const m = (raw ?? "").match(/(\d{1,2})\s*(am|pm)(?:\s*(?:\/\/|\/)\s*(\d{1,2})\s*(am|pm))?/i);
  if (!m) return "";
  const fmt = (n: string, s: string) => `${n} ${s.toUpperCase()}`;
  return m[3] ? `${fmt(m[1], m[2])} – ${fmt(m[3], m[4])}` : fmt(m[1], m[2]);
}

export type Gira = {
  tipo: "especial" | "evento";
  nombre: string;
  fechaDisplay: string;
  horario: string;
  fechaIso: string | null;
  hotel: string;
  dir: string;
};

const GIRAS_START_ROW = 55; // fila 56 del Sheet — antes de eso es histórico viejo, ver index.html original

export async function obtenerGiras(): Promise<Gira[]> {
  return conCache("giras", obtenerGirasSinCache);
}

async function obtenerGirasSinCache(): Promise<Gira[]> {
  const filas = await obtenerFilasSheet("giras");
  const giras: Gira[] = [];
  for (let i = GIRAS_START_ROW; i < filas.length; i++) {
    const r = filas[i];
    const a = (r[0] ?? "").trim();
    const b = (r[1] ?? "").trim();
    const dir = (r[3] ?? "").trim();
    const hotel = (r[4] ?? "").trim();
    if (!a) continue;

    const esEsp = /BOOTCAMP|SYNERGY/i.test(a) && a.length < 70;
    if (esEsp) {
      giras.push({
        tipo: "especial",
        nombre: a,
        fechaDisplay: fechaParaMostrar(b),
        horario: horarioGira(b),
        fechaIso: fechaISO(parsearFechaGira(b)),
        hotel: esBasura(hotel) ? "" : hotel.slice(0, 80),
        dir: esBasura(dir) ? "" : dir.slice(0, 80),
      });
      continue;
    }

    const esEvento = a.length >= 2 && a.length < 60 && !!b && !esURL(a) && !esEsp;
    if (esEvento) {
      giras.push({
        tipo: "evento",
        nombre: a,
        fechaDisplay: fechaParaMostrar(b),
        horario: horarioGira(b),
        fechaIso: fechaISO(parsearFechaGira(b)),
        hotel: esBasura(hotel) ? "" : hotel.slice(0, 100),
        dir: esBasura(dir) ? "" : dir.slice(0, 120),
      });
    }
  }
  return giras;
}

// --- Grupos de Comunidad ----------------------------------------------

export type Grupo = {
  pais: string;
  ciudad: string;
  link: string;
  presidente: string;
  miembros: string;
};

export async function obtenerGrupos(): Promise<Grupo[]> {
  return conCache("grupos", obtenerGruposSinCache);
}

async function obtenerGruposSinCache(): Promise<Grupo[]> {
  const filas = await obtenerFilasSheet("grupos");
  const grupos: Grupo[] = [];
  let paisActual = "";
  for (const r of filas) {
    const a = (r[0] ?? "").trim();
    const b = (r[1] ?? "").trim();
    const c = (r[2] ?? "").trim();
    const d = (r[3] ?? "").trim();
    const e = (r[4] ?? "").trim();
    if (a.toUpperCase() === "PAÍS" || a.toUpperCase() === "PAIS" || b.toUpperCase() === "CIUDAD") continue;
    if (!b && !c) continue;
    if (a && !esURL(a) && a.length < 40) paisActual = a;
    if (b && esURL(c)) {
      const miembros = e.replace(/miembros?/gi, "").trim();
      grupos.push({
        pais: paisActual || "Sin país",
        ciudad: b,
        link: c,
        presidente: d && !esURL(d) && d.length < 60 ? d : "",
        miembros: /^\d+/.test(miembros) ? miembros : "",
      });
    }
  }
  return grupos;
}
