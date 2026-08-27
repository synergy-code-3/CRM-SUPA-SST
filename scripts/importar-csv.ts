import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import type { Cliente, Db } from "../src/lib/types";

const CSV_PATH = path.join(
  process.cwd(),
  "Atención y Seguimiento - Club Sinergético - Registro de atención.csv"
);
const DB_PATH = path.join(process.cwd(), "data", "db.json");

function limpio(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

// El CSV mezcla dos formatos de fecha: "DD/MM/YYYY" (altas capturadas a
// mano) y "MM/DD/YY[YY] [HH:MMam/pm]" (timestamps automáticos de Google
// Sheets). No se puede confiar solo en la posición de la fila: hay filas
// "MM/DD/YYYY" con año de 4 dígitos intercaladas antes del corte (ej. fila
// 1439: "07/29/2026" — el 29 no puede ser mes, así que es 29 de julio, no
// se puede leer como DD/MM). La señal más confiable es: si una de las dos
// primeras partes es mayor a 12, esa parte es inequívocamente el día. Solo
// cuando ambas partes son ≤12 (ambiguo de verdad) se recurre al año de 2
// dígitos y, en último caso, a la posición de la fila.
const FILA_CORTE_FORMATO_US = 1784;

function parsearFecha(v: string | null, numeroFila: number): string | null {
  if (!v) return null;
  const soloFecha = v.split(" ")[0];
  const partes = soloFecha.split("/");
  if (partes.length !== 3) return null;
  const [p1s, p2s, p3s] = partes;
  if (!p1s || !p2s || !p3s) return null;

  const p1 = Number(p1s);
  const p2 = Number(p2s);
  let dia: number;
  let mes: number;

  if (p1 > 12 && p2 <= 12) {
    dia = p1;
    mes = p2;
  } else if (p2 > 12 && p1 <= 12) {
    mes = p1;
    dia = p2;
  } else {
    const formatoUS = p3s.length !== 4 || numeroFila >= FILA_CORTE_FORMATO_US;
    if (formatoUS) {
      mes = p1;
      dia = p2;
    } else {
      dia = p1;
      mes = p2;
    }
  }

  const anio = p3s.length === 4 ? Number(p3s) : 2000 + Number(p3s);
  const fecha = new Date(anio, mes - 1, dia);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

async function main() {
  const csvRaw = await fs.readFile(CSV_PATH, "utf-8");
  const filas: Record<string, string>[] = parse(csvRaw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  const clientes = new Map<string, Cliente>();

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const numeroFila = i + 1;
    const email = fila["Correo"]?.trim().toLowerCase();
    if (!email || !email.includes("@")) continue;

    const nombre = limpio(fila["Nombre"]) ?? email;
    const accesoPlataforma = limpio(fila["Acceso a plataforma"]);

    const notasPartes = [limpio(fila["Notas"]), limpio(fila["NOTAS DE SYNERGY UNLIMITED"])].filter(
      Boolean
    );

    const ahora = new Date().toISOString();
    const existente = clientes.get(email);

    const cliente: Cliente = {
      id: email,
      nombre,
      email,
      // Columnas B–N del CSV de origen.
      telefono: limpio(fila["Teléfono"]) ?? limpio(fila["Numero Corregido"]),
      pais: limpio(fila["Pais"]),
      ciudad: limpio(fila["CIUDAD"]),
      notas: notasPartes.length ? notasPartes.join(" · ") : null,
      fechaInscripcion: parsearFecha(limpio(fila["Fecha de inscripción"]), numeroFila),
      // "FIN DEL ACCESO" del CSV ya no se importa — no es confiable (ver
      // REGLAS-BOLETOS-SYNERGY.md sección 7.1) y este CRM lo calcula siempre
      // solo (fechaRenovacion ?? fechaInscripcion + 1 año).
      fechaRenovacion: existente?.fechaRenovacion ?? null,
      boletosSinInformacion: false,
      // Fila del CSV donde cayó por última vez este correo: define el orden
      // en el CRM (fila más alta = más reciente = primero en la lista).
      ordenCsv: numeroFila,
      fechaEvento: limpio(fila["Fecha Ev."]),
      evento: limpio(fila["EVENTO"]),
      accesoPlataforma,
      tipoMembresia: limpio(fila["Tipo de Membresia"]),
      vencimientoSkool: limpio(fila["Vencimiento Skool"]),
      invitacionSkool: limpio(fila["Invitacion de Skool"]),
      contactoWhats: limpio(fila["Contacto en Whats"]),
      llamada: limpio(fila["Llamada"]),
      // Columna U: notas del equipo de soporte técnico.
      notasSoporte: limpio(fila["NOTAS DE SOPORTE TÉCNICO"]),
      // Placeholder: la asignación real (cantidad + variante MX/US) la calcula
      // `npm run asignar-boletos` a partir de REGLAS-BOLETOS-SYNERGY.md.
      accesos: existente?.accesos ?? { general: [], vip: [], black: [] },
      accesosEditadoManual: existente?.accesosEditadoManual ?? false,
      etiqueta: existente?.etiqueta ?? null,
      tags: existente?.tags ?? [],
      kajabiContactId: existente?.kajabiContactId ?? null,
      eliminadoEn: existente?.eliminadoEn ?? null,
      pausadoEn: existente?.pausadoEn ?? null,
      finAccesoAlPausar: existente?.finAccesoAlPausar ?? null,
      creadoEn: existente?.creadoEn ?? ahora,
      actualizadoEn: ahora,
    };

    clientes.set(email, cliente);
  }

  const db: Db = {
    clientes: Array.from(clientes.values()),
    eventos: Array.from(clientes.values()).map((c) => ({
      id: `import-${c.id}`,
      clienteId: c.id,
      tipo: "IMPORTACION" as const,
      detalle: "Cliente importado desde el CSV de Registro de atención",
      autor: "Importación CSV",
      fecha: c.creadoEn,
    })),
  };

  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf-8");

  console.log(`Importados ${db.clientes.length} clientes → ${DB_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
