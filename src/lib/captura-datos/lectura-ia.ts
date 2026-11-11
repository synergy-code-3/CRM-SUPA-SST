// Lectura con IA por adelantado: mientras alguien trabaja una hoja, el servidor va leyendo las siguientes hojas libres
// para que al llegar a ellas ya estén listas. Corre en segundo plano (after() de Next) y nunca bloquea una hoja ni pisa
// lo que alguien ya estaba escribiendo.
import { ErrorPeticion } from "./errores";
import { devolverLecturaIa, esNoValida, guardarLecturaAdelantada, marcarHojaNoValida, reclamarLecturaIa, siguientesHojasLibres } from "./db";
import { extractFromImage } from "./extract";
import { EMPTY_FIELDS, membresiaPorCantidad, type Box, type Estatus, type Extraction, type SheetFields } from "./fields";
import { descargarArchivo } from "./google";
import { huellaImagen } from "./huella";
import { telefonoClave } from "./duplicadas";
import type { FotoRef, HojaCaptura } from "./modelo";
import { leerFotoHoja } from "@/lib/storage";

/** Tiempo máximo (desde que arranca) para empezar nuevas lecturas adelantadas; la ruta que las lanza tiene maxDuration = 120. */
const PRESUPUESTO_ADELANTO_MS = 60_000;

/** La foto de la hoja en base64: desde Drive o, en hojas viejas, desde el bucket de Supabase. */
export async function fotoBase64(origen: FotoRef): Promise<{ base64: string; mime: string }> {
  if (origen.rutaStorage) {
    const buf = await leerFotoHoja(origen.rutaStorage);
    if (!buf) throw new ErrorPeticion(404, "No se encontró la foto de esta hoja.");
    return { base64: buf.toString("base64"), mime: origen.rutaStorage.endsWith(".pdf") ? "application/pdf" : "image/jpeg" };
  }
  if (origen.driveId) {
    const { base64, mime } = await descargarArchivo(origen.driveId);
    return { base64, mime };
  }
  throw new ErrorPeticion(400, "Esta hoja no tiene foto asociada.");
}

/** Lo que se guarda en la hoja a partir de lo que leyó la IA (sin los campos de control de la extracción). */
export function datosDeExtraccion(extraccion: Extraction): { campos: SheetFields; voucherBox: Box | null } {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { esHojaDeRegistro: _esHoja, motivoNoHoja: _motivo, tieneVoucher: _tieneVoucher, voucherBox, ...campos } = extraccion;
  return { campos, voucherBox };
}

/** Lee con IA una hoja libre que nadie ha tocado y guarda el resultado sin bloquearla. Devuelve el teléfono leído. */
async function leerHojaAdelantada(hoja: HojaCaptura): Promise<string | null> {
  const { base64, mime } = await fotoBase64(hoja.origen);
  const huella = huellaImagen(base64);
  if (await esNoValida(huella)) {
    await marcarHojaNoValida(hoja.id, huella);
    return null;
  }
  if (!(await reclamarLecturaIa(hoja.id, hoja.origen))) return null; // otra lectura ya la reclamó
  let extraccion: Extraction;
  try {
    extraccion = await extractFromImage(base64, mime);
  } catch (err) {
    await devolverLecturaIa(hoja.id, hoja.origen).catch((e) => console.error("lectura-ia: no se pudo devolver la lectura de la hoja", hoja.id, e));
    throw err;
  }
  if (!extraccion.esHojaDeRegistro) {
    await marcarHojaNoValida(hoja.id, huella);
    return null;
  }
  const { campos, voucherBox } = datosDeExtraccion(extraccion);
  const leidos: SheetFields = { ...EMPTY_FIELDS, ...campos };
  if (!leidos.membresia) leidos.membresia = membresiaPorCantidad(leidos.cantidad);
  // Si mientras la IA leía alguien abrió y guardó la hoja, no se pisa: se devuelve la lectura para que la use quien la tiene.
  if (!(await guardarLecturaAdelantada(hoja.id, leidos, voucherBox, hoja.origen))) {
    await devolverLecturaIa(hoja.id, hoja.origen).catch((e) => console.error("lectura-ia: no se pudo devolver la lectura de la hoja", hoja.id, e));
  }
  return leidos.telefono;
}

/** Hojas repetidas seguidas (mismo teléfono) no cuentan como "otra" hoja: se siguen leyendo hasta llegar a una distinta. */
const MAX_REPETIDAS_EXTRA = 20;

/**
 * Se asegura de que las próximas `cuantas` hojas libres del evento (en el orden en que se entregan) ya estén leídas con IA.
 * Si la última leída repite el teléfono de la anterior, sigue hasta leer una distinta. Solo toca hojas pendientes y sin
 * datos; si la IA falla se detiene (no insiste con las demás). Nunca lanza.
 */
export async function adelantarLecturas(eventoId: string, cuantas: number, inverso: boolean, estatus: Estatus, telefonoActual?: string | null): Promise<void> {
  const inicio = Date.now();
  try {
    let anterior = telefonoClave(telefonoActual);
    let vistas = 0;
    for (const hoja of await siguientesHojasLibres(eventoId, cuantas + MAX_REPETIDAS_EXTRA, inverso, estatus)) {
      if (Date.now() - inicio > PRESUPUESTO_ADELANTO_MS) return;
      const yaLeida = hoja.estado !== "pendiente" || hoja.origen.leidaIa;
      const telefono = telefonoClave(yaLeida ? hoja.campos?.telefono : await leerHojaAdelantada(hoja));
      vistas++;
      if (vistas >= cuantas && (!telefono || telefono !== anterior)) return;
      anterior = telefono;
    }
  } catch (err) {
    console.error("captura-datos: lectura adelantada interrumpida", eventoId, err);
  }
}
