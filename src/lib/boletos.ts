import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import type { Accesos, Variante } from "./types";

// Implementa REGLAS-BOLETOS-SYNERGY.md — motor de asignación de accesos a
// partir de la tabla de inventario "Asignacion de boletos.csv".

const INVENTARIO_PATH = path.join(process.cwd(), "Asignacion de boletos.csv");

// 19-sep-2026: fecha de corte fija para considerar a un cliente "activo"
// (sección 2 del documento de reglas).
export const FECHA_CORTE = new Date(2026, 8, 19);

type FilaInventario = {
  evento: string;
  gral_mx: [number, number, number]; // [3m, 6m, 12m]
  vip_mx: [number, number, number];
  gral_us: [number, number, number];
  vip_us: [number, number, number];
  black: number;
};

export type Inventario = Map<string, FilaInventario>;

function normalizar(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

function numero(v: string | undefined): number {
  const n = Number((v ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Columnas fijas del CSV de inventario (verificadas contra el archivo real):
// 0 Evento, 1 Tipo, 2 País, 3-5 GRAL MX (3/6/12), 6-8 VIP MX (3/6/12),
// 9-11 GRAL US (3/6/12), 12-14 VIP US (3/6/12), 15 BLACK.
export async function cargarInventarioBoletos(): Promise<Inventario> {
  const raw = await fs.readFile(INVENTARIO_PATH, "utf-8");
  const filas: string[][] = parse(raw, { skip_empty_lines: true, relax_column_count: true });

  const mapa: Inventario = new Map();
  for (const r of filas.slice(3)) {
    const evento = (r[0] ?? "").trim();
    if (!evento) continue;
    mapa.set(normalizar(evento), {
      evento,
      gral_mx: [numero(r[3]), numero(r[4]), numero(r[5])],
      vip_mx: [numero(r[6]), numero(r[7]), numero(r[8])],
      gral_us: [numero(r[9]), numero(r[10]), numero(r[11])],
      vip_us: [numero(r[12]), numero(r[13]), numero(r[14])],
      black: numero(r[15]),
    });
  }
  return mapa;
}

// Mapa evento → país (columna C de "Asignacion de boletos.csv"), usado para
// clasificar la región de un cliente por el evento al que asistió en vez de
// por el país capturado a mano (más confiable: EPMX-* siempre es MX,
// EPUS-* siempre es US, los webinars LATAM siempre son LATAM, etc.).
// Cacheado en memoria porque el archivo no cambia en tiempo de ejecución.
let cachePaisPorEvento: Map<string, string> | null = null;

export async function cargarPaisPorEvento(): Promise<Map<string, string>> {
  if (cachePaisPorEvento) return cachePaisPorEvento;
  const raw = await fs.readFile(INVENTARIO_PATH, "utf-8");
  const filas: string[][] = parse(raw, { skip_empty_lines: true, relax_column_count: true });

  const mapa = new Map<string, string>();
  for (const r of filas.slice(3)) {
    const evento = (r[0] ?? "").trim();
    const pais = (r[2] ?? "").trim().toUpperCase();
    if (!evento || !pais) continue;
    mapa.set(normalizar(evento), pais);
  }
  cachePaisPorEvento = mapa;
  return mapa;
}

function paisInfo(pais: string | null): { esMx: boolean; esUsCanada: boolean } {
  const p = normalizar(pais);
  return {
    esMx: p.includes("méxico") || p.includes("mexico"),
    esUsCanada: p.includes("estados unidos") || p.includes("canadá") || p.includes("canada"),
  };
}

export type Region = "MX" | "US" | "LATAM";

// Clasifica la región de un cliente por el evento al que asistió (columna
// País de "Asignacion de boletos.csv": EPMX-*→MX, EPUS-*→US, webinars
// LATAM→LATAM, etc.) — más confiable que el país capturado a mano. CAN se
// agrupa con US (mismo criterio que el país capturado a mano, ver
// paisInfo/esUsCanada). Si el evento no está en la tabla (o el cliente no
// tiene evento), cae al país capturado a mano como respaldo.
export function regionDeCliente(
  evento: string | null,
  pais: string | null,
  paisPorEvento: Map<string, string>
): Region {
  const eventoKey = normalizar(evento);
  const paisEvento = eventoKey ? paisPorEvento.get(eventoKey) : undefined;
  if (paisEvento === "MX") return "MX";
  if (paisEvento === "US" || paisEvento === "CAN") return "US";
  if (paisEvento === "LATAM") return "LATAM";

  const { esMx, esUsCanada } = paisInfo(pais);
  if (esMx) return "MX";
  if (esUsCanada) return "US";
  return "LATAM";
}

const ACCESO_VACIO: Accesos = {
  general: { activo: false, cantidad: 0, variante: null },
  vip: { activo: false, cantidad: 0, variante: null },
  black: { activo: false, cantidad: 0, variante: null },
};

function accesoDe(cantidad: number, variante: Variante) {
  return { activo: cantidad > 0, cantidad, variante };
}

export type ResultadoBoletos = {
  accesos: Accesos;
  sinInformacion: boolean;
};

// fechaFinEfectiva: sección 2 — usa "Fin de acceso" si es válido, si no cae a
// fechaInscripción + 1 año.
function fechaFinEfectiva(fechaInscripcion: string | null, finAcceso: string | null): Date | null {
  if (finAcceso) {
    const d = new Date(finAcceso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (fechaInscripcion) {
    const d = new Date(fechaInscripcion);
    if (!Number.isNaN(d.getTime())) {
      d.setFullYear(d.getFullYear() + 1);
      return d;
    }
  }
  return null;
}

export function calcularAccesos(
  cliente: {
    evento: string | null;
    pais: string | null;
    accesoPlataforma: string | null;
    tipoMembresia: string | null;
    fechaInscripcion: string | null;
    finAcceso: string | null;
  },
  inventario: Inventario
): ResultadoBoletos {
  const fin = fechaFinEfectiva(cliente.fechaInscripcion, cliente.finAcceso);
  if (!fin || fin < FECHA_CORTE) {
    return { accesos: ACCESO_VACIO, sinInformacion: false };
  }

  const eventoKey = normalizar(cliente.evento);
  const accesoKey = normalizar(cliente.accesoPlataforma);
  const { esMx, esUsCanada } = paisInfo(cliente.pais);

  // Regla previa (no está en el documento original, pero es sentido común de
  // control de acceso): si el CRM de origen marcó al cliente como
  // "Revocado" en Acceso a plataforma, no se le asignan boletos sin
  // importar el evento al que asistió — el estatus revocado manda sobre
  // cualquier cálculo automático.
  if (accesoKey.includes("revocado")) {
    return { accesos: ACCESO_VACIO, sinInformacion: false };
  }

  // Sección 3.1 — nombres de evento fijos, 1 boleto, MX/US según país.
  if (eventoKey === "vip-su" || eventoKey === "gral-su") {
    const variante: Variante = esMx ? "MX" : "US";
    if (eventoKey === "vip-su") {
      return { accesos: { ...ACCESO_VACIO, vip: accesoDe(1, variante) }, sinInformacion: false };
    }
    return { accesos: { ...ACCESO_VACIO, general: accesoDe(1, variante) }, sinInformacion: false };
  }

  // Sección 4 — Acceso = "Renovación": regla fija por país, ignora inventario.
  if (accesoKey.includes("renov")) {
    if (esMx) {
      return { accesos: { ...ACCESO_VACIO, general: accesoDe(2, "MX") }, sinInformacion: false };
    }
    if (esUsCanada) {
      return {
        accesos: { ...ACCESO_VACIO, vip: accesoDe(2, "MX"), general: accesoDe(2, "US") },
        sinInformacion: false,
      };
    }
    return { accesos: { ...ACCESO_VACIO, vip: accesoDe(2, "MX") }, sinInformacion: false };
  }

  // Sección 3 — evento + duración de membresía → tabla de inventario.
  const fila = inventario.get(eventoKey);
  if (!fila) {
    // Sección 6: sin override disponible en esta fase → "sin información".
    return { accesos: ACCESO_VACIO, sinInformacion: true };
  }

  const memRaw = normalizar(cliente.tipoMembresia);
  const idxDur = memRaw.includes("12") ? 2 : memRaw.includes("6") ? 1 : 0;

  const accesos: Accesos = {
    general: fila.gral_mx[idxDur] > 0 ? accesoDe(fila.gral_mx[idxDur], "MX") : accesoDe(fila.gral_us[idxDur], "US"),
    vip: fila.vip_mx[idxDur] > 0 ? accesoDe(fila.vip_mx[idxDur], "MX") : accesoDe(fila.vip_us[idxDur], "US"),
    black: accesoDe(fila.black, null),
  };

  return { accesos, sinInformacion: false };
}
