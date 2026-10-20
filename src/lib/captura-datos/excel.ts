// Genera el Excel descargable de un evento (con el formato de la plantilla),
// para el botón "Descargar" — la Hoja de Google es la que de verdad importa
// (la escribe lib/google.ts directo vía Apps Script); este Excel es una
// copia de cortesía. A diferencia del proyecto original, siempre parte de
// la plantilla fresca (no reconcilia con un Excel local anterior — aquí la
// base de datos real ya es Supabase, no un archivo).
import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { FILAS_CON_FORMATO, FORMATO_COLUMNAS, columnMap, formatoCantidad, type Clave } from "./columnas";
import { MEMBRESIAS, normalizeFields, toRecord, type SheetRecord } from "./fields";
import type { HojaCaptura } from "./modelo";

const TEMPLATE = path.join(process.cwd(), "plantilla-captura-datos", "plantilla.xlsx");

/** Última fila con datos en las columnas de la app (la plantilla trae formato en muchas filas vacías). */
function lastDataRow(ws: ExcelJS.Worksheet, cols: number[]): number {
  for (let r = ws.rowCount; r >= 2; r--) {
    if (cols.some((c) => cellText(ws, r, c).trim())) return r;
  }
  return 1;
}

function cellText(ws: ExcelJS.Worksheet, row: number, col: number): string {
  const v = ws.getCell(row, col).value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "text" in v) return String(v.text);
  if (typeof v === "object" && "result" in v) return String(v.result ?? "");
  return String(v);
}

/** La plantilla trae TIPO DE MEMBRESIA en mayúsculas y rechaza otros valores; se ajusta a "3 Meses", etc. */
function usarListaMembresias(ws: ExcelJS.Worksheet, col: number) {
  const letra = ws.getColumn(col).letter;
  const lista = `"${MEMBRESIAS.map((m) => m.value).join(",")}"`;
  const { model } = (ws as unknown as { dataValidations: { model: Record<string, ExcelJS.DataValidation> } }).dataValidations;
  for (const [addr, dv] of Object.entries(model)) {
    if (addr.replace(/\d+.*$/, "") === letra && dv.type === "list") dv.formulae = [lista];
  }
}

/** Pinta la columna TIPO DE MEMBRESIA según el texto, como las opciones de la lista del Sheet original. */
function colorearMembresias(ws: ExcelJS.Worksheet, col: number) {
  const letra = ws.getColumn(col).letter;
  const marca = (f?: string) => !!f && /^LOWER\(TRIM\(\$[A-Z]+\d+\)\)="\d+ meses"$/.test(f);
  const w = ws as unknown as { conditionalFormattings: { rules: { formulae?: string[] }[] }[] };
  w.conditionalFormattings = w.conditionalFormattings.filter((cf) => !cf.rules.some((r) => marca(r.formulae?.[0])));
  ws.addConditionalFormatting({
    ref: `${letra}2:${letra}1000`,
    rules: MEMBRESIAS.map((m, i) => ({
      type: "expression" as const,
      priority: i + 1,
      formulae: [`LOWER(TRIM($${letra}2))="${m.value.toLowerCase()}"`],
      style: {
        fill: { type: "pattern" as const, pattern: "solid" as const, bgColor: { argb: `FF${m.fondo}` } },
        font: { color: { argb: `FF${m.texto}` } },
      },
    })),
  });
}

/** Deja todas las celdas de datos de las columnas de la app con el mismo formato (FORMATO_COLUMNAS). */
function formatoUniforme(ws: ExcelJS.Worksheet, map: Partial<Record<Clave, number>>, hasta: number) {
  const entradas = Object.entries(map) as [Clave, number][];
  const conteo = new Map<string, { font: Partial<ExcelJS.Font>; n: number }>();
  for (let r = 2; r <= hasta; r++) {
    for (const [, col] of entradas) {
      const f = ws.getCell(r, col).font ?? {};
      const k = `${f.name ?? ""}|${f.size ?? ""}|${f.family ?? ""}`;
      const e = conteo.get(k) ?? { font: { name: f.name, size: f.size, family: f.family, scheme: f.scheme }, n: 0 };
      e.n++;
      conteo.set(k, e);
    }
  }
  const letra = [...conteo.values()].sort((a, b) => b.n - a.n)[0]?.font ?? {};
  const fuente: Partial<ExcelJS.Font> = { ...letra, bold: false, italic: false, underline: false, strike: false, color: { theme: 1 } };
  for (let r = 2; r <= hasta; r++) {
    for (const [clave, col] of entradas) {
      const cell = ws.getCell(r, col);
      cell.style = {
        numFmt: FORMATO_COLUMNAS[clave].numFmt,
        font: { ...fuente },
        alignment: { horizontal: FORMATO_COLUMNAS[clave].alinear, vertical: "bottom", wrapText: false },
        fill: { type: "pattern", pattern: "none" },
        border: {},
        ...(cell.style.protection ? { protection: { ...cell.style.protection } } : {}),
      };
    }
  }
}

/** Excel completo de las hojas confirmadas de un evento, a partir de la plantilla. */
export async function generarExcelEvento(hojas: HojaCaptura[]): Promise<Buffer> {
  const confirmadas = hojas.filter((h) => h.estado === "confirmada" && h.campos);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await readFile(TEMPLATE)) as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  const map = columnMap((ws.getRow(1).values as unknown[]).slice(1));
  const cols = Object.values(map) as number[];
  if (map.membresia) {
    usarListaMembresias(ws, map.membresia);
    colorearMembresias(ws, map.membresia);
  }

  const previas = lastDataRow(ws, cols) - 1;
  const n = confirmadas.length;
  formatoUniforme(ws, map, Math.max(ws.rowCount, n + 1, previas + 1, FILAS_CON_FORMATO));
  for (let i = 0; i < Math.max(n, previas); i++) {
    const row = i + 2;
    const r: Partial<SheetRecord> = i < n ? toRecord(normalizeFields(confirmadas[i].campos!, confirmadas[i].estatus), confirmadas[i].estatus) : {};
    for (const [clave, col] of Object.entries(map) as [Clave, number][]) {
      const cell = ws.getCell(row, col);
      const v = r[clave];
      if (v === undefined || v === "") {
        cell.value = null;
        continue;
      }
      if (clave === "linkWa") cell.value = { text: String(v), hyperlink: String(v) };
      else if (clave === "cantidad") {
        cell.value = Number(v);
        cell.numFmt = formatoCantidad(Number(v));
      } else if (clave === "folio" && /^\d+$/.test(String(v))) cell.value = Number(v);
      else cell.value = String(v);
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
