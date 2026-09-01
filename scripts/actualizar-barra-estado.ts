// Seguimiento de scripts/importar-atencion-seguimiento.ts: llena los 3
// campos que alimentan la "barra de estado" (EstadoOnboarding en
// src/app/(app)/clientes/page.tsx) a partir de las columnas I/L/M de la
// misma hoja actualizada — sin volver a tocar teléfono/país/evento/etc (ya
// se hizo en la corrida anterior) y sin volver a agregar la nota
// consolidada (para no duplicarla).
//
// Columna I "Acceso a plataforma" es un caso especial: NO se escribe el
// texto crudo — ese mismo campo (acceso_plataforma) alimenta
// calcularAccesos(), donde el texto "revocado" vacía los boletos y
// "renov" dispara la regla fija por país. Escribir el texto tal cual
// pisaría la decisión ya tomada de no aplicar esas acciones reales desde
// este import. En vez de eso: si la columna I indica acceso activo (Si,
// Renovación, Team Sinergético, En automático), se escribe el literal
// "Si" — valor neutro que solo prende la primera lucesita
// (kajabiActivo = accesoPlataforma === "si") sin activar ninguna regla
// especial del motor de boletos. Si indica lo contrario (No/Revocado/
// Pausa/vacío), no se toca nada — la luz ya está apagada por default.
//
// Columnas L "Invitacion de Skool" y M "Contacto en Whats" sí se escriben
// tal cual: son puramente informativas/visuales, no alimentan
// calcularAccesos().
//
// Uso: npx tsx scripts/actualizar-barra-estado.ts --dry-run
//      npx tsx scripts/actualizar-barra-estado.ts

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
  const ERROR_FORMULA = /^#(REF|VALUE|N\/A|ERROR|DIV\/0|NAME|NULL|NUM)/i;
  if (!s.length || ERROR_FORMULA.test(s)) return null;
  return s;
}

const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");
function normalizarClave(v: string): string {
  return v.trim().toLowerCase().normalize("NFD").replace(DIACRITICOS, "");
}

// Valores de la columna I que significan "sí tiene acceso activo a
// Kajabi" — cualquier otra cosa (No, Revocado, Pausa, vacío, "30 dias",
// etc.) se deja sin tocar, a propósito (ver comentario de arriba).
const ACCESO_ACTIVO = new Set(["si", "renovacion", "team sinergetico", "en automatico"]);

type Fila = {
  email: string;
  nombre: string;
  invitacionSkool: string | null;
  contactoWhats: string | null;
  accesoActivo: boolean;
};

async function main() {
  const texto = fs.readFileSync(CSV_PATH, "utf-8");
  const filas: Record<string, string>[] = parse(texto, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
  console.log(`Filas leídas: ${filas.length}`);

  const porEmail = new Map<string, Fila>();
  for (const fila of filas) {
    const email = fila["Correo"]?.trim().toLowerCase();
    if (!email || !email.includes("@")) continue;

    const accesoCrudo = limpio(fila["Acceso a plataforma"]);
    porEmail.set(email, {
      email,
      nombre: limpio(fila["Nombre"]) ?? email,
      invitacionSkool: limpio(fila["Invitacion de Skool"]),
      contactoWhats: limpio(fila["Contacto en Whats"]),
      accesoActivo: accesoCrudo ? ACCESO_ACTIVO.has(normalizarClave(accesoCrudo)) : false,
    });
  }
  console.log(`Correos únicos: ${porEmail.size}`);

  const registros = [...porEmail.values()];
  const conInvitacionSkool = registros.filter((f) => f.invitacionSkool).length;
  const conContactoWhats = registros.filter((f) => f.contactoWhats).length;
  const conAccesoActivo = registros.filter((f) => f.accesoActivo).length;
  console.log(`Con Invitación Skool: ${conInvitacionSkool}`);
  console.log(`Con Contacto WhatsApp: ${conContactoWhats}`);
  console.log(`Con acceso activo detectado (columna I → "Si"): ${conAccesoActivo}`);

  if (DRY_RUN) {
    console.log("\n--- Muestra de 5 ---");
    for (const f of registros.slice(0, 5)) console.log(JSON.stringify(f, null, 2));
    console.log("\nDRY RUN — no se escribió nada.");
    return;
  }

  const ahora = new Date().toISOString();
  let actualizados = 0;
  for (let i = 0; i < registros.length; i += CHUNK) {
    const chunk = registros.slice(i, i + CHUNK);
    const payload = chunk
      .filter((f) => f.invitacionSkool || f.contactoWhats || f.accesoActivo)
      .map((f) => {
        const base: Record<string, unknown> = {
          id: f.email,
          nombre: f.nombre,
          email: f.email,
          actualizado_en: ahora,
        };
        if (f.invitacionSkool) base.invitacion_skool = f.invitacionSkool;
        if (f.contactoWhats) base.contacto_whats = f.contactoWhats;
        if (f.accesoActivo) base.acceso_plataforma = "Si";
        return base;
      });
    if (payload.length === 0) continue;

    const { error } = await supabase.from("clientes").upsert(payload, { onConflict: "id" });
    if (error) throw error;

    actualizados += payload.length;
    process.stdout.write(`\rActualizados: ${actualizados}`);
  }
  console.log(`\nListo. Actualizados: ${actualizados}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
