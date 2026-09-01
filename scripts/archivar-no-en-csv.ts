// "Resetear" el CRM para que coincida exacto con la hoja de Atención y
// Seguimiento actualizada: archiva (NO borra — eliminarCliente solo pone
// eliminado_en, reversible desde "Eliminados") a cualquier cliente activo
// que no exista en el CSV. No toca Kajabi ni ningún acceso — es
// exclusivamente edición de la lista del CRM, tal como se acordó.
//
// Uso: npx tsx scripts/archivar-no-en-csv.ts --dry-run
//      npx tsx scripts/archivar-no-en-csv.ts

import "./_env";
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { supabase } from "../src/lib/supabase";
import { eliminarCliente } from "../src/lib/db";

const CSV_PATH = path.join(
  process.cwd(),
  "Atención y Seguimiento - Club Sinergético - Registro de atención Actualizado.csv"
);
const DRY_RUN = process.argv.includes("--dry-run");
const PAGINA = 1000;

async function main() {
  const texto = fs.readFileSync(CSV_PATH, "utf-8");
  const filas: Record<string, string>[] = parse(texto, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
  const emailsCsv = new Set(
    filas.map((f) => f["Correo"]?.trim().toLowerCase()).filter((e) => e && e.includes("@"))
  );
  console.log(`Correos únicos en el CSV: ${emailsCsv.size}`);

  const aArchivar: { id: string; nombre: string }[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("clientes")
      .select("id,nombre")
      .is("eliminado_en", null)
      .order("id", { ascending: true })
      .range(from, from + PAGINA - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const c of data) {
      if (!emailsCsv.has(c.id)) aArchivar.push(c);
    }
    if (data.length < PAGINA) break;
    from += PAGINA;
  }

  console.log(`Clientes activos que NO están en el CSV (se van a archivar): ${aArchivar.length}`);
  if (DRY_RUN) {
    console.log(JSON.stringify(aArchivar, null, 2));
    console.log("\nDRY RUN — no se archivó nada.");
    return;
  }

  let n = 0;
  for (const c of aArchivar) {
    await eliminarCliente(c.id, "Reset CRM = CSV (archivado, no borrado)");
    n++;
    process.stdout.write(`\rArchivados: ${n}/${aArchivar.length}`);
  }
  console.log(`\nListo. ${n} clientes archivados (reversibles desde "Eliminados").`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
