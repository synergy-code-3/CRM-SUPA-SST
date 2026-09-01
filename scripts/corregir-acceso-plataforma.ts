// Recalcula acceso_plataforma para TODOS los clientes que están en el CSV,
// de forma definitiva y determinista (no depende de qué había antes ni de
// en qué orden corrieron los scripts anteriores): "Si" si la columna I dice
// "Si"/"Renovación"/"Team Sinergético"/"En automático" (confirmado con el
// usuario — todos esos SÍ prenden la luz de acceso a Kajabi), null en
// cualquier otro caso (No/Revocado/Pausa/vacío/etc).
//
// Uso: npx tsx scripts/corregir-acceso-plataforma.ts --dry-run
//      npx tsx scripts/corregir-acceso-plataforma.ts

import "./_env";
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { supabase } from "../src/lib/supabase";

const CSV_PATH = path.join(
  process.cwd(),
  "Atención y Seguimiento - Club Sinergético - Registro de atención Actualizado.csv"
);
const DRY_RUN = process.argv.includes("--dry-run");
const CHUNK = 300;

function limpio(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");
function normalizarClave(v: string): string {
  return v.trim().toLowerCase().normalize("NFD").replace(DIACRITICOS, "");
}

const ACCESO_ACTIVO = new Set(["si", "renovacion", "team sinergetico", "en automatico"]);

async function main() {
  const texto = fs.readFileSync(CSV_PATH, "utf-8");
  const filas: Record<string, string>[] = parse(texto, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  // Dedup por correo, última aparición gana (mismo criterio que siempre).
  const porEmail = new Map<string, boolean>();
  for (const fila of filas) {
    const email = fila["Correo"]?.trim().toLowerCase();
    if (!email || !email.includes("@")) continue;
    const acceso = limpio(fila["Acceso a plataforma"]);
    porEmail.set(email, acceso ? ACCESO_ACTIVO.has(normalizarClave(acceso)) : false);
  }
  console.log(`Correos únicos: ${porEmail.size}`);

  const activos = [...porEmail.values()].filter(Boolean).length;
  console.log(`Con acceso activo (Si/Renovación/Team Sinergético/En automático): ${activos}`);
  console.log(`Con cualquier otro valor (se pone en null): ${porEmail.size - activos}`);

  if (DRY_RUN) {
    console.log("\nDRY RUN — no se escribió nada.");
    return;
  }

  const emails = [...porEmail.keys()];
  const ahora = new Date().toISOString();
  let procesados = 0;
  for (let i = 0; i < emails.length; i += CHUNK) {
    const chunkEmails = emails.slice(i, i + CHUNK);
    const { data: filasDb, error: errLectura } = await supabase
      .from("clientes")
      .select("id,nombre,email")
      .in("id", chunkEmails);
    if (errLectura) throw errLectura;

    const payload = (filasDb ?? []).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      email: c.email,
      acceso_plataforma: porEmail.get(c.id) ? "Si" : null,
      actualizado_en: ahora,
    }));
    if (payload.length) {
      const { error } = await supabase.from("clientes").upsert(payload, { onConflict: "id" });
      if (error) throw error;
    }

    procesados += chunkEmails.length;
    process.stdout.write(`\rProcesados: ${procesados}/${emails.length}`);
  }
  console.log(`\nListo. ${emails.length} clientes recalculados.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
