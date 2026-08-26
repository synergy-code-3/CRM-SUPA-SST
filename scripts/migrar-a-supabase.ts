import "./_env";
import fs from "node:fs/promises";
import path from "node:path";
import { supabase } from "../src/lib/supabase";
import { cargarPaisPorEvento, regionDeCliente } from "../src/lib/boletos";
import { parsearFechaSkool } from "../src/lib/fechas";
import { fechaSkoolADateOnly } from "../src/lib/supabase-map";
import type { Db } from "../src/lib/types";

const DB_PATH = path.join(process.cwd(), "data", "db.json");
const LOTE = 500;

async function main() {
  const raw = await fs.readFile(DB_PATH, "utf-8");
  const db: Db = JSON.parse(raw);
  const paisPorEvento = await cargarPaisPorEvento();

  console.log(`Migrando ${db.clientes.length} clientes y ${db.eventos.length} eventos a Supabase…`);

  const filasClientes = db.clientes.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    email: c.email,
    telefono: c.telefono,
    pais: c.pais,
    ciudad: c.ciudad,
    notas: c.notas,
    fecha_inscripcion: c.fechaInscripcion,
    fecha_renovacion: c.fechaRenovacion,
    boletos_sin_informacion: c.boletosSinInformacion,
    orden_csv: c.ordenCsv,
    fecha_evento: c.fechaEvento,
    evento: c.evento,
    acceso_plataforma: c.accesoPlataforma,
    tipo_membresia: c.tipoMembresia,
    vencimiento_skool: c.vencimientoSkool,
    vencimiento_skool_fecha: fechaSkoolADateOnly(parsearFechaSkool(c.vencimientoSkool)),
    invitacion_skool: c.invitacionSkool,
    contacto_whats: c.contactoWhats,
    llamada: c.llamada,
    notas_soporte: c.notasSoporte,
    region: regionDeCliente(c.evento, c.pais, paisPorEvento),
    accesos: c.accesos,
    creado_en: c.creadoEn,
    actualizado_en: c.actualizadoEn,
  }));

  for (let i = 0; i < filasClientes.length; i += LOTE) {
    const lote = filasClientes.slice(i, i + LOTE);
    const { error } = await supabase.from("clientes").upsert(lote, { onConflict: "id" });
    if (error) throw new Error(`Error en lote de clientes ${i}-${i + lote.length}: ${error.message}`);
    process.stdout.write(`\rClientes: ${Math.min(i + LOTE, filasClientes.length)}/${filasClientes.length}`);
  }
  console.log();

  const filasEventos = db.eventos.map((e) => ({
    id: e.id,
    cliente_id: e.clienteId,
    tipo: e.tipo,
    detalle: e.detalle,
    autor: e.autor,
    fecha: e.fecha,
  }));

  for (let i = 0; i < filasEventos.length; i += LOTE) {
    const lote = filasEventos.slice(i, i + LOTE);
    const { error } = await supabase.from("eventos_timeline").upsert(lote, { onConflict: "id" });
    if (error) throw new Error(`Error en lote de eventos ${i}-${i + lote.length}: ${error.message}`);
    process.stdout.write(`\rEventos: ${Math.min(i + LOTE, filasEventos.length)}/${filasEventos.length}`);
  }
  console.log();

  console.log("Migración completa.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
