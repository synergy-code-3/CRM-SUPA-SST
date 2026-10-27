// Esquemas de lo que la API acepta del navegador. Cualquier dato fuera de
// forma se rechaza con 400 antes de tocar Supabase, Drive o la IA.
//
// Adaptado del proyecto original: ya no existe el "lote" (un escaneo = un
// archivo en disco) — ahora cada evento y cada hoja son una fila (uuid) en
// Supabase, así que los esquemas que dependían de archivos locales
// (excelLocal, borrador, metaArchivo de reapertura local) no aplican.
import { z } from "zod";
import { ESTATUS } from "./fields";
import { idValido } from "./modelo";

const texto = (max: number) => z.string().max(max);
const entero = (min: number, max: number) => z.number().int().min(min).max(max);
const fraccion = z.number().finite().transform((n) => Math.min(1, Math.max(0, n)));

export const idDrive = z.string().regex(/^[\w-]{10,200}$/);
export const idUuid = z.string().refine((v) => {
  try {
    idValido(v);
    return true;
  } catch {
    return false;
  }
});
const estatus = z.enum(ESTATUS.map((e) => e.value) as [string, ...string[]]);
const origen = z.enum(["drive", "local"]);

export const destino = z.object({
  id: idDrive,
  url: texto(500).regex(/^https:\/\/(drive|docs)\.google\.com\//),
  nombre: texto(300),
});

export const campos = z.object({
  folio: texto(30).default(""),
  nombre: texto(300).default(""),
  correo: texto(320).default(""),
  lada: z.enum(["+52", "+1"]).default("+52"),
  telefono: texto(40).default(""),
  tarjeta: texto(30).default(""),
  marcaTarjeta: texto(30).default(""),
  metodoPago: texto(40).default(""),
  cantidad: texto(30).default(""),
  membresia: texto(40).default(""),
  notas: texto(2000).default(""),
});

export const caja = z.object({ x: fraccion, y: fraccion, w: fraccion, h: fraccion });

export const fotoRef = z.object({
  nombreOriginal: texto(500).default(""),
  driveId: idDrive.optional(),
  rutaStorage: texto(300).optional(),
  nombreDrive: texto(300).optional(),
  pagina: entero(1, 100_000).optional(),
  paginas: entero(1, 100_000).optional(),
  w: entero(0, 100_000).optional(),
  h: entero(0, 100_000).optional(),
});

export const crearEvento = z.object({
  nombre: texto(200),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  estatus,
  destino,
  origen,
  carpetaOrigenId: idDrive.optional(),
  usuariosAsignados: z.array(idUuid).max(50).default([]),
});

// PATCH /api/captura-datos/hojas/[id] — autoguardado (sin `confirmar`) o
// confirmación (`confirmar: true`, ahí sí se valida con validateFields en
// la ruta según el estatus de la hoja).
export const patchHoja = z.object({
  campos: campos.optional(),
  voucherBox: caja.nullable().optional(),
  confirmar: z.boolean().optional(),
  version: z.number().int().optional(), // bloqueo optimista: si no coincide, 409
});

export const consultaAxis = z.object({ telefono: z.string().regex(/^\d{10}$/) });

export const patchEvento = z.object({
  accion: z.enum(["confirmar", "cerrar", "reabrir"]), // "confirmar" guarda en Drive sin cerrar; "cerrar" guarda y cierra
  motivo: texto(500).optional(), // obligatorio solo para "reabrir", se valida en la ruta
  crearCarpeta: z.boolean().optional(), // para "confirmar"/"cerrar": crear la subcarpeta de fotos si falta
  sinFotos: z.boolean().optional(), // para "confirmar"/"cerrar": guardar los datos aunque falten fotos por subir
});

export const borradoEvento = z.object({ motivo: texto(500) }); // se exige no vacío en borrarEventoDirecto
