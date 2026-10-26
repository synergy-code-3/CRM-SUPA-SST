// Comunicación con Google Drive/Sheets a través del Web App de Apps Script
// (ya publicado, APPS_SCRIPT_URL/APPS_SCRIPT_SECRET). Portado casi sin
// cambios del proyecto original — es un wrapper puro de la API de Google,
// no dependía del almacenamiento local. Lo único que cambia es
// `guardarEventoEnDrive`: en vez de mutar un único "Escaneo" en disco, lee/
// actualiza las filas de cap_eventos/cap_hojas en Supabase.
import { carpetaDeEstatus, conSeparadores, imageFileName, normalizeFields, sinNotaAMeses, toRecord, type Estatus, type SheetRecord } from "./fields";
import { actualizarCarpetaFotosEvento, actualizarDriveEvento, actualizarOrigenHoja, confirmarEvento, listarHojasDeEvento, obtenerEvento } from "./db";
import { leerFotoHoja } from "@/lib/storage";
import type { HojaCaptura } from "./modelo";
import { ErrorPeticion } from "./errores";

export const DRIVE_READY = !!(process.env.APPS_SCRIPT_URL && process.env.APPS_SCRIPT_SECRET);
const FOTO_CONCURRENCY = 3;
const REGISTRO_VACIO: SheetRecord = {
  nombre: "", correo: "", lada: "", telefono: "", linkWa: "", tarjeta: "", metodoPago: "", cantidad: "", folio: "", membresia: "", notas: "", estatus: "",
};

// Errores en los que la petición nunca llegó a Google: es seguro reintentar sin duplicar nada.
const SIN_CONEXION = new Set(["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "ETIMEDOUT"]);

async function fetchConReintento(url: string, init?: RequestInit, intentos = 3): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      const code = (err as { cause?: { code?: string } }).cause?.code ?? "";
      if (!SIN_CONEXION.has(code) || i >= intentos) {
        throw SIN_CONEXION.has(code) ? new ErrorPeticion(502, "No hay conexión con Google. Revisa tu internet e inténtalo de nuevo.") : err;
      }
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

// Acciones que solo leen: repetirlas no duplica nada, así que se pueden reintentar si Google responde mal.
const ACCIONES_DE_LECTURA = new Set(["infoCarpeta", "listarArchivos", "descargar", "leerHoja"]);
const INTENTOS_LECTURA = 3;

export async function call<T>(payload: Record<string, unknown>): Promise<T> {
  const intentos = ACCIONES_DE_LECTURA.has(String(payload.action)) ? INTENTOS_LECTURA : 1;
  for (let i = 1; ; i++) {
    const data = await llamarUnaVez<T>(payload);
    if (data !== null) return data;
    if (i >= intentos) {
      throw new ErrorPeticion(502, "Google no respondió como se esperaba. Revisa que la aplicación web esté publicada con acceso 'Cualquier usuario'.");
    }
    await new Promise((r) => setTimeout(r, 1500 * i));
  }
}

/** Una llamada al Web App. null = Google no devolvió JSON (página de error, límite de uso o Web App no público). */
async function llamarUnaVez<T>(payload: Record<string, unknown>): Promise<T | null> {
  if (!DRIVE_READY) throw new ErrorPeticion(503, "Falta configurar Drive (APPS_SCRIPT_URL en .env).");
  // Apps Script responde al POST con una redirección a script.googleusercontent.com donde está el resultado.
  // Se sigue a mano con un GET limpio: al seguirla automáticamente, Google responde 404.
  let res = await fetchConReintento(process.env.APPS_SCRIPT_URL!, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...payload, secret: process.env.APPS_SCRIPT_SECRET }),
    redirect: "manual",
  });
  const location = res.headers.get("location");
  if (res.status >= 300 && res.status < 400 && location) {
    const destino = new URL(location, process.env.APPS_SCRIPT_URL);
    if (destino.protocol !== "https:" || !/(^|\.)(google|googleusercontent)\.com$/.test(destino.hostname)) {
      throw new ErrorPeticion(502, "Google respondió con una redirección inesperada.");
    }
    res = await fetchConReintento(destino.toString());
  }
  const text = await res.text();
  let data: T & { error?: string };
  try {
    data = JSON.parse(text);
  } catch {
    console.warn(`google ${String(payload.action)}: respuesta no JSON (HTTP ${res.status}): ${text.slice(0, 200).replace(/\s+/g, " ")}`);
    return null;
  }
  if (data.error) throw new ErrorPeticion(502, traducirError(data.error));
  return data;
}

/** Texto libre que empieza como fórmula (=, +, -, @) se guarda como texto en la Hoja: un apóstrofo inicial lo evita. */
export function neutralizarFormula(texto: string): string {
  return /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
}

function traducirError(msg: string): string {
  if (/papelera/i.test(msg)) return msg; // ya es un mensaje claro del script (carpeta o archivo en la papelera)
  if (/Acción desconocida/.test(msg)) {
    return "El script de Google está desactualizado: pega la versión nueva de Codigo-para-pegar.gs y publica una nueva versión.";
  }
  if (/not found|no se encontr|does not exist|no existe|access denied|permiso|permission/i.test(msg)) {
    return `Google: ${msg}. Revisa que la carpeta esté compartida como Editor con la cuenta que publicó el script.`;
  }
  return `Google: ${msg}`;
}

/** Saca el ID de carpeta de un enlace de Drive (…/folders/<ID>, ?id=<ID>) o acepta el ID solo. */
export function idDeEnlace(enlace: string): string | null {
  const s = enlace.trim();
  const m = s.match(/\/folders\/([\w-]{10,})/) ?? s.match(/[?&]id=([\w-]{10,})/);
  if (m) return m[1];
  return /^[\w-]{20,}$/.test(s) ? s : null;
}

export interface InfoCarpeta {
  id: string;
  nombre: string;
  url: string;
  subcarpetas: { nombre: string; id: string; archivos: number }[];
  hojas: { id: string; nombre: string; url: string; modificado: string }[];
}

export const infoCarpeta = (carpetaId: string) => call<InfoCarpeta>({ action: "infoCarpeta", carpetaId });

export const listarArchivos = (carpetaId: string) =>
  call<{ archivos: { id: string; nombre: string; mime: string; tamano: number }[] }>({ action: "listarArchivos", carpetaId });

export const descargarArchivo = (archivoId: string) =>
  call<{ nombre: string; mime: string; base64: string }>({ action: "descargar", archivoId });

/** Subcarpeta del estatus (Completos/Apartados/Interesados) dentro de la carpeta destino del evento; la crea si falta. */
export async function carpetaDeFotos(destinoId: string, estatus: Estatus): Promise<string> {
  const nombre = carpetaDeEstatus(estatus);
  const info = await infoCarpeta(destinoId);
  const existente = info.subcarpetas.find((s) => s.nombre === nombre);
  if (existente) return existente.id;
  return (await call<{ id: string }>({ action: "crearCarpeta", padreId: destinoId, nombre })).id;
}

/** Sube un archivo (JPEG o PDF) directo a Drive: las fotos no se guardan en Supabase. Devuelve el id en Drive. */
export async function subirArchivoADrive(carpetaId: string, nombre: string, bytes: Buffer, tipo: "jpeg" | "pdf"): Promise<string> {
  const mime = tipo === "pdf" ? "application/pdf" : "image/jpeg";
  const { id } = await call<{ id: string }>({ action: "subirFoto", carpetaId, nombre, image: bytes.toString("base64"), mime });
  return id;
}

/**
 * Renombra en Drive las fotos que subió la app (las que tienen `nombreDrive`) a "folio_nombre.ext" de las hojas
 * confirmadas. Las fotos importadas de una carpeta del usuario no se tocan. Es best-effort: un fallo no frena el guardado.
 */
export async function renombrarFotosDeEvento(eventoId: string): Promise<number> {
  const hojas = (await listarHojasDeEvento(eventoId)).filter((h) => h.estado === "confirmada" && h.campos && h.origen.driveId && h.origen.nombreDrive);
  let renombradas = 0;
  for (const h of hojas) {
    const nombre = imageFileName(h.campos!, undefined, h.origen.nombreDrive!.endsWith(".pdf") ? "pdf" : "jpg");
    if (nombre === h.origen.nombreDrive) continue;
    try {
      await call({ action: "renombrar", archivoId: h.origen.driveId, nombre });
      await actualizarOrigenHoja(h.id, { ...h.origen, nombreDrive: nombre });
      renombradas++;
    } catch (err) {
      console.error("captura-datos: no se pudo renombrar la foto en Drive", h.id, err);
    }
  }
  return renombradas;
}

export const leerHoja = (hojaId: string) =>
  call<{ id: string; nombre: string; url: string; gid?: number; filas: Record<string, string>[]; meta: string }>({ action: "leerHoja", hojaId });

/** Error de Google que indica que la Hoja ya no está: en la papelera o borrada (no un fallo de conexión). */
export const esHojaAusente = (msg: string) => /papelera|no se encontr|could be found|not found|does not exist|no existe/i.test(msg);

/**
 * Si la Hoja sigue en Drive (fuera de la papelera). Si no se puede consultar (sin conexión, Drive sin configurar),
 * se da por activa: es preferible avisar de un folio repetido de más que dejar pasar uno.
 */
export async function hojaEnDrive(hojaId: string): Promise<boolean> {
  try {
    await leerHoja(hojaId);
    return true;
  } catch (err) {
    return !esHojaAusente((err as Error).message);
  }
}

// Guardado en curso por evento: un reintento espera a que termine el anterior (p. ej. tras cancelar).
const enCurso = new Map<string, Promise<unknown>>();

export type ResultadoDrive =
  | { ok: true; hojaUrl: string; filas: number; fotosSubidas: number; fotosFaltantes: number }
  | { ok: false; faltaCarpeta: string };

/**
 * Confirma el evento en Drive:
 *  1. Sube las fotos que se cargaron desde la computadora (sin driveId todavía) a la subcarpeta del estado
 *     (Completos/…). Si no existe, devuelve { faltaCarpeta } para que el admin confirme antes de crearla.
 *  2. Crea (en la raíz de la carpeta destino) o actualiza la Hoja de cálculo con todas las hojas confirmadas.
 * Solo las hojas en estado "confirmada" se escriben — las demás (pendiente/leída/no válida) no cuentan.
 */
export async function guardarEventoEnDrive(
  eventoId: string,
  usuarioId: string,
  opts: { crearCarpeta?: boolean; sinFotos?: boolean; cerrar?: boolean },
  signal?: AbortSignal
): Promise<ResultadoDrive> {
  const anterior = enCurso.get(eventoId);
  if (anterior) await anterior.catch(() => {});
  const run = guardar(eventoId, usuarioId, opts, signal);
  enCurso.set(eventoId, run);
  try {
    return await run;
  } finally {
    if (enCurso.get(eventoId) === run) enCurso.delete(eventoId);
  }
}

async function guardar(
  eventoId: string,
  usuarioId: string,
  opts: { crearCarpeta?: boolean; sinFotos?: boolean; cerrar?: boolean },
  signal?: AbortSignal
): Promise<ResultadoDrive> {
  const evento = await obtenerEvento(eventoId);
  if (!evento) throw new ErrorPeticion(404, "No se encontró el evento");
  let hojas = (await listarHojasDeEvento(eventoId)).filter((h) => h.estado === "confirmada");
  if (hojas.length === 0) throw new ErrorPeticion(409, "Este evento no tiene hojas confirmadas.");

  // 1. Fotos cargadas desde la computadora que aún no están en Drive: la de cada hoja y las de sus adjuntas (otros pagos)
  type FotoPendiente = { hojaId: string; principalId: string; nombre: string; rutaStorage: string };
  const fotos: FotoPendiente[] = hojas.flatMap((h) => [
    ...(h.origen.rutaStorage && !h.origen.driveId
      ? [{ hojaId: h.id, principalId: h.id, nombre: imageFileName(h.campos!), rutaStorage: h.origen.rutaStorage }]
      : []),
    ...(h.adjuntas ?? []).flatMap((a, i) =>
      a.foto.rutaStorage && !a.foto.driveId
        ? [{ hojaId: a.id, principalId: h.id, nombre: imageFileName(h.campos!, i + 2), rutaStorage: a.foto.rutaStorage }]
        : []
    ),
  ]);
  let subidas = 0;
  let faltantes = opts.sinFotos ? 0 : 0;
  if (fotos.length && !opts.sinFotos) {
    let carpetaId = evento.carpetaFotosId;
    if (!carpetaId) {
      const nombre = carpetaDeEstatus(hojas[0].estatus);
      const info = await infoCarpeta(evento.destino.id);
      carpetaId = info.subcarpetas.find((s) => s.nombre === nombre)?.id ?? null;
      if (!carpetaId) {
        if (!opts.crearCarpeta) return { ok: false, faltaCarpeta: nombre };
        carpetaId = (await call<{ id: string }>({ action: "crearCarpeta", padreId: evento.destino.id, nombre })).id;
      }
      await actualizarCarpetaFotosEvento(eventoId, carpetaId);
    }
    let next = 0;
    const worker = async () => {
      while (next < fotos.length) {
        if (signal?.aborted) throw new ErrorPeticion(409, "Subida cancelada");
        const f = fotos[next++];
        const foto = await leerFotoHoja(f.rutaStorage);
        if (!foto) {
          faltantes++;
          continue;
        }
        const image = foto.toString("base64");
        const { id } = await call<{ id: string }>({ action: "subirFoto", carpetaId, nombre: f.nombre, image });
        subidas++;
        const hojaDeEstaFoto = hojas.find((h) => h.id === f.hojaId || h.adjuntas.some((a) => a.id === f.hojaId));
        if (hojaDeEstaFoto?.id === f.hojaId) {
          await actualizarOrigenHoja(f.hojaId, { ...hojaDeEstaFoto.origen, driveId: id, pagina: undefined });
        }
        // Las adjuntas (jsonb dentro de la hoja principal) se actualizan junto con el resto al releer abajo.
      }
    };
    const resultados = await Promise.allSettled(Array.from({ length: FOTO_CONCURRENCY }, worker));
    const fallo = resultados.find((r) => r.status === "rejected");
    if (fallo) throw (fallo as PromiseRejectedResult).reason;
  }

  // 1b. Las fotos que la app subió directo a Drive se renombran con folio y nombre
  if (!opts.sinFotos) await renombrarFotosDeEvento(eventoId);

  // 2. Hoja de cálculo (copia de la plantilla) en la raíz de la carpeta destino
  if (signal?.aborted) throw new ErrorPeticion(409, "Subida cancelada");
  hojas = (await listarHojasDeEvento(eventoId)).filter((h) => h.estado === "confirmada");
  // Secciones separadas (Completos, Apartados, Interesados) con renglones en blanco entre ellas.
  const registros = conSeparadores(hojas).map((h) => {
    if (!h) return REGISTRO_VACIO;
    const r = toRecord(normalizeFields(h.campos!, h.estatus), h.estatus);
    // "Pago a meses" vive solo en las notas editables de la hoja, no en Drive.
    return { ...r, notas: neutralizarFormula(sinNotaAMeses(r.notas)) };
  });
  const payload = {
    action: "guardarHoja",
    destinoId: evento.destino.id,
    nombre: evento.nombre,
    registros,
    filasPrevias: evento.drive?.filas ?? 0,
  };
  let hoja: { id: string; url: string; gid?: number };
  try {
    hoja = await call({ ...payload, hojaId: evento.drive?.hojaId, meta: JSON.stringify({ version: 1, eventoId }) });
  } catch (err) {
    // Si borraron la Hoja en Drive, se crea de nuevo
    if (!evento.drive?.hojaId || !/no se encontr|not found|does not exist|no existe/i.test((err as Error).message)) throw err;
    hoja = await call({ ...payload, filasPrevias: 0, meta: JSON.stringify({ version: 1, eventoId }) });
  }
  const drive = { hojaId: hoja.id, hojaUrl: hoja.url, filas: registros.length, gid: hoja.gid };
  if (opts.cerrar) await confirmarEvento(eventoId, usuarioId, drive);
  else await actualizarDriveEvento(eventoId, drive);
  return { ok: true, hojaUrl: hoja.url, filas: registros.length, fotosSubidas: subidas, fotosFaltantes: faltantes };
}

// Tipo auxiliar solo para que el archivo compile en editores que no infieren bien `HojaCaptura["campos"]!`.
export type { HojaCaptura };
