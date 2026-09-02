// Reconciliación masiva contra la hoja "Atención y Seguimiento - Club
// Sinergético - Registro de atención Actualizado.csv" — versión actualizada
// de la misma hoja que originalmente pobló el CRM (ver scripts/importar-csv.ts,
// el importador original a data/db.json antes de migrar a Supabase). Reglas
// acordadas con el usuario para esta pasada:
//
//  - Match por correo (id normalizado).
//  - Fecha de inscripción: SIEMPRE gana el CSV, aunque el cliente ya tenga una.
//  - Acceso a plataforma (incluye Revocado/Pausa): NO se aplica como acción
//    real — solo queda anotado en la nota consolidada, el acceso actual del
//    CRM no se toca.
//  - Columnas de texto libre/estado (Notas, STATUS, Renovar/No Renovar,
//    Renovación, Customer Happiness, encuesta, soporte técnico, Synergy
//    Unlimited, llamadas, Invitacion de Skool, Contacto en Whats, WhatsApp,
//    Acceso a plataforma, Unido al grupo de telegram): se consolidan en UNA
//    sola nota nueva por cliente, no pisan los campos de proceso que ya
//    gestiona el CRM en vivo.
//  - EVENTO: solo se escribe si coincide exacto con el catálogo real o con
//    un alias confirmado a mano con el usuario (ver EVENTO_ALIAS). Si no
//    hay match, se deja el evento actual del cliente sin tocar.
//  - Correos que no existen todavía en el CRM: se crean, SIN disparar
//    Kajabi/Skool/WhatsApp (es reconciliación histórica, no alta en vivo).
//  - Boletos: se recalculan igual que `npm run asignar-boletos`, respetando
//    accesos_editado_manual.
//
// Uso: npx tsx scripts/importar-atencion-seguimiento.ts --dry-run
//      npx tsx scripts/importar-atencion-seguimiento.ts          (escribe de verdad)

import "./_env";
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { supabase } from "../src/lib/supabase";
import { cargarInventarioBoletos, calcularAccesos } from "../src/lib/boletos";

const CSV_PATH = path.join(
  process.cwd(),
  "Atención y Seguimiento - Club Sinergético - Registro de atención Actualizado.csv"
);
const DRY_RUN = process.argv.includes("--dry-run");
const CHUNK = 300;

// La hoja original de Google Sheets trae errores de fórmula literales
// (#REF!, #VALUE!, etc.) en varias columnas — se tratan como "sin dato", no
// como texto real.
const ERROR_FORMULA = /^#(REF|VALUE|N\/A|ERROR|DIV\/0|NAME|NULL|NUM)/i;

function limpio(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s.length || ERROR_FORMULA.test(s)) return null;
  return s;
}

// Copiado tal cual de scripts/importar-csv.ts (el importador original) —
// mismo criterio ya probado para el formato mixto DD/MM/YYYY vs MM/DD/YY[YY].
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

// Alias de EVENTO acordados a mano con el usuario para esta pasada — el
// resto de valores sin match exacto contra el catálogo se deja sin tocar.
const EVENTO_ALIAS: Record<string, string> = {
  wjs: "WJS-MX",
  "js-web": "WJS-MX",
  wmdl: "WMDL-MX",
  "mdl-web": "WMDL-MX",
  "usa - wjs": "USA-WJS",
  "ciudad de méxico": "EPMX - CDMX",
  "ciudad de mexico": "EPMX - CDMX",
  cdmx: "EPMX - CDMX",
  "cdmx-js": "EPMX - CDMX",
  guadalajara: "EPMX - GDL",
  gdl: "EPMX - GDL",
  "gdl-js": "EPMX - GDL",
  puebla: "EPMX - PUEBLA",
  toluca: "EPMX - TOLUCA",
  mty: "EPMX - MTY",
  monterrey: "EPMX - MTY",
  "mty-jsml": "EPMX - MTY",
  querétaro: "EPMX - QRO",
  queretaro: "EPMX - QRO",
  qro: "EPMX - QRO",
  "js-qro": "EPMX - QRO",
  ags: "EPMX - AGS",
  león: "EPMX - LEON",
  leon: "EPMX - LEON",
  "leon-js": "EPMX - LEON",
  morelia: "EPMX - MORELIA",
  houston: "EPUS - HOUSTON",
  dallas: "EPUS - DALLAS",
  atlanta: "EPUS - ATLANTA",
  phx: "EPUS - PHOENIX",
  sandiego: "EPUS - SAN DIEGO",
  newark: "EPUS - NEWARK",
  vegas: "EPUS - LAS VEGAS",
  washington: "EPUS - WASHINGTON",
  chicago: "EPUS - CHICAGO",
  austin: "EPUS - AUSTIN",
  sacramento: "EPUS - SACRAMENTO",
  boston: "EPUS - BOSTON",
  sanfran: "EPUS - SAN FRANCISCO",
  cancún: "EPMX-CANCUN",
  cancun: "EPMX-CANCUN",
  "san jose": "EPUS - SAN JOSE",
  tijuana: "EPMX-TIJUANA",
  chihuahua: "EPMX - CHIHUAHUA",
  "san antonio": "EPUS - SAN ANTONIO",
  orlando: "EPUS - ORLANDO",
  philadelphia: "EPUS - PHILADELPHIA",
  miami: "EPUS - MIAMI",
  "san luis potosí": "EPMX - SLP",
  "san luis potosi": "EPMX - SLP",
  "ciudad juárez": "EPMX - JUAREZ",
  "ciudad juarez": "EPMX - JUAREZ",
  aguascalientes: "EPMX - AGS",
  tampa: "EPUS - TAMPA",
  mexicali: "EPMX-MXL",
  hermosillo: "EPMX - HMO",
  mérida: "EPMX-MERIDA",
  merida: "EPMX-MERIDA",
  "wjs usa": "USA-WJS",
  "mdl -qro": "EPMX - QRO",
  "mdl-qro": "EPMX - QRO",
  "us-wmdl": "USA-WMDL",
  "js web": "WJS-MX",
  // Reglas especiales de calcularAccesos (src/lib/boletos.ts) — no vienen
  // del catálogo, son casos fijos: MÁS+/MAS = 3 VIP vitalicios, BLACK
  // ACCESS = 1 Black a Synergy Unlimited 2026 (sujeto a membresía activa).
  "más+": "MÁS+",
  mas: "MÁS+",
  "más+ usa": "MÁS+ USA",
  "black access": "BLACK ACCESS",
};

function normalizarClaveEvento(v: string): string {
  return v.trim().toLowerCase();
}

// Columnas que se consolidan en una sola nota nueva por cliente, en vez de
// pisar campos de proceso que el CRM ya gestiona en vivo. El nombre de cada
// una se antepone como etiqueta, para que la nota quede legible.
const COLUMNAS_NOTA: [string, string][] = [
  ["Notas", "Notas"],
  ["Acceso a plataforma", "Acceso a plataforma (hoja)"],
  ["STATUS", "Status"],
  ["Renovar/No Renovar", "Renovar/No renovar"],
  ["Renovación", "Renovación"],
  ["Customer Happiness", "Customer Happiness"],
  ["Realizó encuesta", "Encuesta"],
  ["NOTAS DE SOPORTE TÉCNICO", "Soporte técnico"],
  ["TIPO DE BOLETO SYNERGY UNLIMITED", "Tipo de boleto Synergy Unlimited"],
  ["NOTAS DE SYNERGY UNLIMITED", "Synergy Unlimited"],
  ["Llamada", "Llamada"],
  ["Llamada Seg", "Llamada seguimiento"],
  ["Invitacion de Skool", "Invitación Skool (hoja)"],
  ["Contacto en Whats", "Contacto en WhatsApp (hoja)"],
  ["WhatsApp", "WhatsApp (hoja)"],
  ["Unido al grupo de telegram", "Telegram"],
];

function construirNota(fila: Record<string, string>): string | null {
  const partes: string[] = [];
  for (const [col, etiqueta] of COLUMNAS_NOTA) {
    const v = limpio(fila[col]);
    if (v) partes.push(`${etiqueta}: ${v}`);
  }
  return partes.length ? partes.join(" · ") : null;
}

// Extrae el código de país (ej. "+52") de la columna Pais tal como viene
// ("México +52", "Perú+51", "Estados Unidos +1") y lo canonicaliza a un
// nombre limpio. Si no reconoce el país, deja el texto original (limpio) tal
// cual, sin inventar nada.
const PAISES: { patron: RegExp; nombre: string; codigo: string }[] = [
  { patron: /m[eé]xico|^mx\b/i, nombre: "México", codigo: "52" },
  { patron: /estados unidos|^us\b/i, nombre: "Estados Unidos", codigo: "1" },
  { patron: /colombia/i, nombre: "Colombia", codigo: "57" },
  { patron: /per[uú]/i, nombre: "Perú", codigo: "51" },
  { patron: /ecuador/i, nombre: "Ecuador", codigo: "593" },
  { patron: /guatemala/i, nombre: "Guatemala", codigo: "502" },
  { patron: /argentina/i, nombre: "Argentina", codigo: "54" },
  { patron: /chile/i, nombre: "Chile", codigo: "56" },
  { patron: /espa[nñ]a/i, nombre: "España", codigo: "34" },
];

function normalizarPais(v: string | null): { pais: string | null; codigo: string | null } {
  if (!v) return { pais: null, codigo: null };
  for (const p of PAISES) {
    if (p.patron.test(v)) return { pais: p.nombre, codigo: p.codigo };
  }
  return { pais: v, codigo: null };
}

function normalizarTelefono(numero: string | null, codigoPais: string | null): string | null {
  if (!numero) return null;
  const soloDigitos = numero.replace(/[^\d+]/g, "");
  if (!soloDigitos) return null;
  if (soloDigitos.startsWith("+")) return soloDigitos;
  if (codigoPais && !soloDigitos.startsWith(codigoPais)) return `+${codigoPais}${soloDigitos}`;
  return `+${soloDigitos}`;
}

function normalizarMembresia(v: string | null): string | null {
  if (!v) return null;
  const m = v.trim().toLowerCase();
  if (m === "3 meses") return "3 Meses";
  if (m === "6 meses") return "6 Meses";
  if (m === "12 meses") return "12 Meses";
  return null; // valor no reconocido: no se escribe basura
}

type FilaProcesada = {
  numeroFila: number;
  email: string;
  nombre: string;
  telefono: string | null;
  pais: string | null;
  ciudad: string | null;
  fechaInscripcion: string | null;
  fechaEvento: string | null;
  evento: string | null;
  tipoMembresia: string | null;
  nota: string | null;
};

async function main() {
  // El archivo es UTF-8 real (confirmado por los bytes crudos: "é" = C3 A9)
  // — no windows-1252/latin1, a pesar de que algunas herramientas lo
  // mostraban mal por asumir la codificación equivocada al leerlo.
  const texto = fs.readFileSync(CSV_PATH, "utf-8");
  const filas: Record<string, string>[] = parse(texto, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  console.log(`Filas leídas: ${filas.length}`);

  // Dedup por correo: última aparición en el archivo gana (mismo criterio de
  // "más reciente" que ya usa ordenCsv).
  const porEmail = new Map<string, FilaProcesada>();
  let sinCorreo = 0;
  let eventosMatchExacto = 0;
  let eventosMatchAlias = 0;
  let eventosSinMatch = 0;
  const eventosSinMatchMuestra = new Map<string, number>();

  let catalogoEventos: Set<string>;
  {
    const { data, error } = await supabase.from("catalogo_opciones").select("valor").eq("tipo", "evento");
    if (error) throw error;
    catalogoEventos = new Set((data ?? []).map((r) => r.valor));
  }

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const numeroFila = i + 1;
    const email = fila["Correo"]?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      sinCorreo++;
      continue;
    }

    const eventoCrudo = limpio(fila["EVENTO"]);
    let evento: string | null = null;
    if (eventoCrudo) {
      if (catalogoEventos.has(eventoCrudo)) {
        evento = eventoCrudo;
        eventosMatchExacto++;
      } else {
        const alias = EVENTO_ALIAS[normalizarClaveEvento(eventoCrudo)];
        if (alias) {
          evento = alias;
          eventosMatchAlias++;
        } else {
          eventosSinMatch++;
          eventosSinMatchMuestra.set(eventoCrudo, (eventosSinMatchMuestra.get(eventoCrudo) ?? 0) + 1);
        }
      }
    }

    const { pais, codigo } = normalizarPais(limpio(fila["Pais"]));
    const telefonoLocal = limpio(fila["Numero Corregido"]) ?? limpio(fila["Teléfono"]);

    porEmail.set(email, {
      numeroFila,
      email,
      nombre: limpio(fila["Nombre"]) ?? email,
      telefono: normalizarTelefono(telefonoLocal, codigo),
      pais,
      ciudad: limpio(fila["CIUDAD"]),
      fechaInscripcion: parsearFecha(limpio(fila["Fecha de inscripción"]), numeroFila),
      fechaEvento: limpio(fila["Fecha Ev."]),
      evento,
      tipoMembresia: normalizarMembresia(limpio(fila["Tipo de Membresia"])),
      nota: construirNota(fila),
    });
  }

  console.log(`Filas sin correo (ignoradas): ${sinCorreo}`);
  console.log(`Correos únicos: ${porEmail.size}`);
  console.log(
    `EVENTO — match exacto: ${eventosMatchExacto}, match por alias: ${eventosMatchAlias}, sin match (no se toca): ${eventosSinMatch}`
  );
  if (DRY_RUN) {
    const top = [...eventosSinMatchMuestra.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60);
    console.log("Top 60 EVENTO sin match (muestra):");
    for (const [v, n] of top) console.log(`  ${v}: ${n}`);
  }

  // Quiénes ya existen como cliente en el CRM.
  const emails = [...porEmail.keys()];
  const existentes = new Set<string>();
  for (let i = 0; i < emails.length; i += CHUNK) {
    const chunk = emails.slice(i, i + CHUNK);
    const { data, error } = await supabase.from("clientes").select("id").in("id", chunk);
    if (error) throw error;
    for (const r of data ?? []) existentes.add(r.id);
    process.stdout.write(`\rRevisando existentes: ${Math.min(i + CHUNK, emails.length)}/${emails.length}`);
  }
  console.log();

  const aActualizar = [...porEmail.values()].filter((f) => existentes.has(f.email));
  const aCrear = [...porEmail.values()].filter((f) => !existentes.has(f.email));

  console.log(`A actualizar (ya existen): ${aActualizar.length}`);
  console.log(`A crear (nuevos): ${aCrear.length}`);

  if (DRY_RUN) {
    const con = (pred: (f: FilaProcesada) => boolean) => aActualizar.filter(pred).length;
    console.log("\n--- De los que se van a actualizar, cuántos traen cada campo ---");
    console.log(`  telefono: ${con((f) => !!f.telefono)}`);
    console.log(`  pais: ${con((f) => !!f.pais)}`);
    console.log(`  ciudad: ${con((f) => !!f.ciudad)}`);
    console.log(`  fechaInscripcion: ${con((f) => !!f.fechaInscripcion)}`);
    console.log(`  evento (mapeado): ${con((f) => !!f.evento)}`);
    console.log(`  tipoMembresia: ${con((f) => !!f.tipoMembresia)}`);
    console.log(`  nota (se va a agregar 1 nota): ${con((f) => !!f.nota)}`);
    console.log("\n--- Muestra de 5 actualizaciones ---");
    for (const f of aActualizar.slice(0, 5)) {
      console.log(JSON.stringify(f, null, 2));
    }
    console.log("\n--- Muestra de 5 altas nuevas ---");
    for (const f of aCrear.slice(0, 5)) {
      console.log(JSON.stringify(f, null, 2));
    }
    console.log("\nDRY RUN — no se escribió nada.");
    return;
  }

  const inventario = await cargarInventarioBoletos();
  const ahora = new Date().toISOString();

  // --- Actualizar existentes ---
  let actualizados = 0;
  for (let i = 0; i < aActualizar.length; i += CHUNK) {
    const chunk = aActualizar.slice(i, i + CHUNK);
    const { data: filasDb, error: errLectura } = await supabase
      .from("clientes")
      .select("id,nombre,email,evento,pais,acceso_plataforma,tipo_membresia,fecha_inscripcion,fecha_renovacion,accesos_editado_manual")
      .in(
        "id",
        chunk.map((f) => f.email)
      );
    if (errLectura) throw errLectura;
    const porId = new Map((filasDb ?? []).map((r) => [r.id, r]));

    const payload = chunk.map((f) => {
      const db = porId.get(f.email);
      const eventoFinal = f.evento ?? db?.evento ?? null;
      const membresiaFinal = f.tipoMembresia ?? db?.tipo_membresia ?? null;
      const fechaInscripcionFinal = f.fechaInscripcion ?? db?.fecha_inscripcion ?? null;

      const base: Record<string, unknown> = {
        id: f.email,
        nombre: f.nombre,
        email: f.email,
        actualizado_en: ahora,
        orden_csv: f.numeroFila,
      };
      if (f.telefono) base.telefono = f.telefono;
      if (f.pais) base.pais = f.pais;
      if (f.ciudad) base.ciudad = f.ciudad;
      if (f.fechaEvento) base.fecha_evento = f.fechaEvento;
      if (f.fechaInscripcion) base.fecha_inscripcion = f.fechaInscripcion;
      if (f.evento) base.evento = f.evento;
      if (f.tipoMembresia) base.tipo_membresia = f.tipoMembresia;

      if (db && !db.accesos_editado_manual) {
        const { accesos, sinInformacion } = calcularAccesos(
          {
            evento: eventoFinal,
            pais: f.pais ?? db.pais,
            accesoPlataforma: db.acceso_plataforma,
            tipoMembresia: membresiaFinal,
            fechaInscripcion: fechaInscripcionFinal,
            fechaRenovacion: db.fecha_renovacion,
            // Script histórico, no se re-ejecuta — MÁS+/Black Access ahora
            // se resuelven por etiqueta (ver boletos.ts), no por esta
            // pasada masiva.
            etiqueta: null,
          },
          inventario
        );
        base.accesos = accesos;
        base.boletos_sin_informacion = sinInformacion;
      }
      return base;
    });

    const { error: errUpdate } = await supabase.from("clientes").upsert(payload, { onConflict: "id" });
    if (errUpdate) throw errUpdate;

    const notas = chunk.filter((f) => f.nota).map((f) => ({
      cliente_id: f.email,
      tipo: "NOTA",
      detalle: `Importado desde hoja de Atención y Seguimiento (actualizada): ${f.nota}`,
      autor: "Importación CSV",
    }));
    if (notas.length) {
      const { error: errNota } = await supabase.from("eventos_timeline").insert(notas);
      if (errNota) throw errNota;
    }

    actualizados += chunk.length;
    process.stdout.write(`\rActualizados: ${actualizados}/${aActualizar.length}`);
  }
  console.log();

  // --- Crear nuevos (sin Kajabi/Skool/WhatsApp — reconciliación histórica) ---
  let creados = 0;
  for (let i = 0; i < aCrear.length; i += CHUNK) {
    const chunk = aCrear.slice(i, i + CHUNK);
    const payload = chunk.map((f) => {
      const { accesos, sinInformacion } = calcularAccesos(
        {
          evento: f.evento,
          pais: f.pais,
          accesoPlataforma: null,
          tipoMembresia: f.tipoMembresia,
          fechaInscripcion: f.fechaInscripcion,
          fechaRenovacion: null,
          etiqueta: null,
        },
        inventario
      );
      return {
        id: f.email,
        nombre: f.nombre,
        email: f.email,
        telefono: f.telefono,
        pais: f.pais,
        ciudad: f.ciudad,
        fecha_inscripcion: f.fechaInscripcion,
        fecha_evento: f.fechaEvento,
        evento: f.evento,
        tipo_membresia: f.tipoMembresia,
        orden_csv: f.numeroFila,
        accesos,
        boletos_sin_informacion: sinInformacion,
        creado_en: ahora,
        actualizado_en: ahora,
      };
    });

    const { error: errInsert } = await supabase.from("clientes").insert(payload);
    if (errInsert) throw errInsert;

    const eventosNuevos = chunk.flatMap((f) => {
      const base = [
        {
          cliente_id: f.email,
          tipo: "CREACION",
          detalle: "Cliente importado desde hoja de Atención y Seguimiento (actualizada)",
          autor: "Importación CSV",
        },
      ];
      if (f.nota) {
        base.push({
          cliente_id: f.email,
          tipo: "NOTA",
          detalle: `Importado desde hoja de Atención y Seguimiento (actualizada): ${f.nota}`,
          autor: "Importación CSV",
        });
      }
      return base;
    });
    const { error: errEventos } = await supabase.from("eventos_timeline").insert(eventosNuevos);
    if (errEventos) throw errEventos;

    creados += chunk.length;
    process.stdout.write(`\rCreados: ${creados}/${aCrear.length}`);
  }
  console.log();

  console.log(`\nListo. Actualizados: ${actualizados}. Creados: ${creados}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
