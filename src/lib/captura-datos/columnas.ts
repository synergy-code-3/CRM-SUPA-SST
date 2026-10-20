// Detección de columnas por el texto del encabezado (fila 1). Misma lógica que columnMap() en
// google-apps-script/Codigo.gs, para que el Excel local y la Hoja de Google se lean y escriban igual.
import type { SheetRecord } from "./fields";

export type Clave = keyof SheetRecord;

const COLUMNS: { key: Clave; match: string[] }[] = [
  { key: "nombre", match: ["nombre", "cliente"] },
  { key: "correo", match: ["correo", "email", "mail"] },
  { key: "lada", match: ["lada", "codigo de pais"] },
  { key: "telefono", match: ["telefono", "celular", "tel", "movil"] },
  { key: "linkWa", match: ["link wa", "link whatsapp", "whatsapp", "wa"] },
  { key: "tarjeta", match: ["tarjeta", "ultimos 4"] },
  { key: "metodoPago", match: ["met pago", "metodo de pago", "metodo pago", "forma de pago", "metodo"] },
  { key: "cantidad", match: ["cant", "cantidad", "monto", "importe", "total"] },
  { key: "folio", match: ["folio", "no folio"] },
  { key: "membresia", match: ["tipo de membresia", "membresia", "plan"] },
  { key: "notas", match: ["notas", "nota", "observaciones", "comentarios"] },
  { key: "estatus", match: ["estatus", "status", "estado"] },
];

// Formato uniforme de las celdas de datos (filas 2 en adelante). La plantilla viene de una hoja usada a mano y trae
// celdas en negritas, de otro color, con otra alineación o con relleno suelto; el Excel y la Hoja de Drive las
// dejan todas iguales. Debe coincidir con FORMATO_COLUMNAS en google-apps-script/Codigo.gs.
export type Alineacion = "left" | "center" | "right";
export const FORMATO_COLUMNAS: Record<Clave, { alinear: Alineacion; numFmt: string }> = {
  nombre: { alinear: "left", numFmt: "@" },
  correo: { alinear: "left", numFmt: "@" },
  lada: { alinear: "center", numFmt: "@" },
  telefono: { alinear: "left", numFmt: "@" }, // texto: conserva el "+" de la lada
  linkWa: { alinear: "left", numFmt: "@" },
  tarjeta: { alinear: "right", numFmt: "@" }, // texto: conserva los ceros
  metodoPago: { alinear: "left", numFmt: "@" },
  cantidad: { alinear: "right", numFmt: '"$"#,##0' },
  folio: { alinear: "right", numFmt: "0" },
  membresia: { alinear: "left", numFmt: "@" },
  notas: { alinear: "left", numFmt: "@" },
  estatus: { alinear: "left", numFmt: "@" },
};

/** Pesos sin centavos si es un monto entero (9997 → $9,997); con centavos si no (9997.5 → $9,997.50). */
export const formatoCantidad = (n: number) => (Number.isInteger(n) ? '"$"#,##0' : '"$"#,##0.00');

/** Filas de datos que se dejan con formato uniforme aunque estén vacías (la plantilla trae ~1,000). */
export const FILAS_CON_FORMATO = 1000;

function normalize(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Devuelve { clave: númeroDeColumna (1-based) } a partir de los encabezados. */
export function columnMap(headers: unknown[]): Partial<Record<Clave, number>> {
  const norm = headers.map(normalize);
  const map: Partial<Record<Clave, number>> = {};
  const used = new Set<number>();
  const pasadas = [
    (h: string, m: string) => h === m || h.startsWith(m + " "),
    (h: string, m: string) => ` ${h} `.includes(` ${m} `) || h.startsWith(m),
  ];
  for (const test of pasadas) {
    for (const c of COLUMNS) {
      if (map[c.key]) continue;
      const idx = norm.findIndex((h, i) => !used.has(i) && c.match.some((m) => test(h, m)));
      if (idx !== -1) {
        map[c.key] = idx + 1;
        used.add(idx);
      }
    }
  }
  if (!map.folio) throw new Error('La fila 1 no tiene una columna "Folio"');
  return map;
}
