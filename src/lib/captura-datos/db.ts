// CRUD de Captura de Datos contra Supabase (cap_eventos / cap_hojas y
// tablas relacionadas). Reemplaza al "almacen" + "escaneo.ts" del proyecto
// original (un solo Escaneo guardado como JSON en disco) — aquí cada
// evento y cada hoja son su propia fila, para que varias personas trabajen
// el mismo evento en paralelo.
import { supabase } from "@/lib/supabase";
import type { Estatus, SheetFields } from "./fields";
import { validateFields } from "./fields";
import type { Adjunta, Destino, EstadoEvento, EstadoHoja, EventoCaptura, FotoRef, HojaCaptura, OrigenEvento } from "./modelo";
import type { Box } from "./fields";
import { ErrorPeticion } from "./errores";

type FilaEvento = {
  id: string;
  nombre: string;
  fecha: string | null;
  destino: Destino;
  origen: OrigenEvento;
  carpeta_fotos_id: string | null;
  estado: EstadoEvento;
  drive: EventoCaptura["drive"];
  creado_por: string | null;
  creado_en: string;
  confirmado_por: string | null;
  confirmado_en: string | null;
};

function filaAEvento(f: FilaEvento): EventoCaptura {
  return {
    id: f.id,
    nombre: f.nombre,
    fecha: f.fecha,
    destino: f.destino,
    origen: f.origen,
    carpetaFotosId: f.carpeta_fotos_id,
    estado: f.estado,
    drive: f.drive,
    creadoPorId: f.creado_por,
    creadoEn: f.creado_en,
    confirmadoPorId: f.confirmado_por,
    confirmadoEn: f.confirmado_en,
  };
}

type FilaHoja = {
  id: string;
  evento_id: string;
  estatus: Estatus;
  origen: FotoRef;
  estado: EstadoHoja;
  bloqueada_por: string | null;
  bloqueada_hasta: string | null;
  campos: SheetFields | null;
  voucher_box: Box | null;
  adjuntas: Adjunta[];
  confirmada_por: string | null;
  confirmada_en: string | null;
  folio: string | null;
  version: number;
};

/** Una lectura con IA reclamada que nunca terminó (la función murió a medias) deja de contar como leída pasado este tiempo. */
export const LEASE_LECTURA_IA_MS = 3 * 60 * 1000;

export function sinReclamoVencido(origen: FotoRef): FotoRef {
  if (!origen.leidaIa || !origen.leidaIaDesde) return origen;
  if (Date.now() - new Date(origen.leidaIaDesde).getTime() < LEASE_LECTURA_IA_MS) return origen;
  return { ...origen, leidaIa: undefined, leidaIaDesde: undefined };
}

function filaAHoja(f: FilaHoja): HojaCaptura {
  return {
    id: f.id,
    eventoId: f.evento_id,
    estatus: f.estatus,
    origen: sinReclamoVencido(f.origen),
    estado: f.estado,
    bloqueadaPorId: f.bloqueada_por,
    bloqueadaHasta: f.bloqueada_hasta,
    campos: f.campos,
    voucherBox: f.voucher_box,
    adjuntas: f.adjuntas ?? [],
    confirmadaPorId: f.confirmada_por,
    confirmadaEn: f.confirmada_en,
    folio: f.folio,
    version: f.version,
  };
}

// --- Eventos ---------------------------------------------------------

export async function crearEvento(input: {
  nombre: string;
  fecha: string;
  destino: Destino;
  origen: OrigenEvento;
  carpetaFotosId?: string | null;
  creadoPorId: string;
  usuariosAsignados: string[];
}): Promise<EventoCaptura> {
  const { data, error } = await supabase
    .from("cap_eventos")
    .insert({
      nombre: input.nombre,
      fecha: input.fecha,
      destino: input.destino,
      origen: input.origen,
      carpeta_fotos_id: input.carpetaFotosId ?? null,
      creado_por: input.creadoPorId,
    })
    .select("*")
    .single();
  if (error) throw error;

  const asignados = [...new Set([input.creadoPorId, ...input.usuariosAsignados])];
  if (asignados.length) {
    const { error: errAsig } = await supabase
      .from("cap_evento_asignaciones")
      .insert(asignados.map((usuarioId) => ({ evento_id: data.id, usuario_id: usuarioId })));
    if (errAsig) throw errAsig;
  }

  return filaAEvento(data as FilaEvento);
}

export type ProgresoEvento = Record<EstadoHoja, number>;

/** (evento, estado) de todas las hojas de esos eventos, paginado (PostgREST corta en 1000 filas por consulta). */
async function estadosDeHojas(eventoIds: string[]): Promise<{ evento_id: string; estado: EstadoHoja }[]> {
  const filas: { evento_id: string; estado: EstadoHoja }[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from("cap_hojas")
      .select("evento_id, estado")
      .in("evento_id", eventoIds)
      .order("id")
      .range(desde, desde + 999);
    if (error) throw error;
    filas.push(...(data as { evento_id: string; estado: EstadoHoja }[]));
    if (data.length < 1000) break;
  }
  return filas;
}

/** Ids de los eventos a los que está asignada una persona. */
async function eventoIdsDeUsuario(usuarioId: string): Promise<string[]> {
  const { data, error } = await supabase.from("cap_evento_asignaciones").select("evento_id").eq("usuario_id", usuarioId);
  if (error) throw error;
  return (data as { evento_id: string }[]).map((a) => a.evento_id);
}

export async function usuarioAsignado(eventoId: string, usuarioId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("cap_evento_asignaciones")
    .select("evento_id")
    .eq("evento_id", eventoId)
    .eq("usuario_id", usuarioId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** Sin `soloDeUsuarioId` devuelve todos los eventos (admin); con él, solo aquellos a los que esa persona está asignada. */
export async function listarEventos(soloDeUsuarioId?: string): Promise<(EventoCaptura & { progreso: ProgresoEvento; usuariosAsignados: string[] })[]> {
  let consulta = supabase.from("cap_eventos").select("*").order("creado_en", { ascending: false });
  if (soloDeUsuarioId) {
    const ids = await eventoIdsDeUsuario(soloDeUsuarioId);
    if (ids.length === 0) return [];
    consulta = consulta.in("id", ids);
  }
  const { data, error } = await consulta;
  if (error) throw error;
  const eventos = (data as FilaEvento[]).map(filaAEvento);
  if (eventos.length === 0) return [];

  const [hojas, { data: asignaciones, error: errAsig }] = await Promise.all([
    estadosDeHojas(eventos.map((e) => e.id)),
    supabase.from("cap_evento_asignaciones").select("evento_id, usuario_id").in("evento_id", eventos.map((e) => e.id)),
  ]);
  if (errAsig) throw errAsig;

  const progresoPorEvento = new Map<string, ProgresoEvento>();
  for (const h of hojas) {
    const p = progresoPorEvento.get(h.evento_id) ?? { pendiente: 0, leida: 0, confirmada: 0, no_valida: 0 };
    p[h.estado]++;
    progresoPorEvento.set(h.evento_id, p);
  }
  const asignadosPorEvento = new Map<string, string[]>();
  for (const a of asignaciones as { evento_id: string; usuario_id: string }[]) {
    const lista = asignadosPorEvento.get(a.evento_id) ?? [];
    lista.push(a.usuario_id);
    asignadosPorEvento.set(a.evento_id, lista);
  }

  return eventos.map((e) => ({
    ...e,
    progreso: progresoPorEvento.get(e.id) ?? { pendiente: 0, leida: 0, confirmada: 0, no_valida: 0 },
    usuariosAsignados: asignadosPorEvento.get(e.id) ?? [],
  }));
}

export async function obtenerEvento(id: string): Promise<EventoCaptura | null> {
  const { data, error } = await supabase.from("cap_eventos").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? filaAEvento(data as FilaEvento) : null;
}

export async function listarAsignaciones(eventoId: string): Promise<string[]> {
  const { data, error } = await supabase.from("cap_evento_asignaciones").select("usuario_id").eq("evento_id", eventoId);
  if (error) throw error;
  return (data as { usuario_id: string }[]).map((a) => a.usuario_id);
}

export async function reemplazarAsignaciones(eventoId: string, usuariosAsignados: string[]): Promise<void> {
  const { error: errBorrar } = await supabase.from("cap_evento_asignaciones").delete().eq("evento_id", eventoId);
  if (errBorrar) throw errBorrar;
  if (usuariosAsignados.length === 0) return;
  const { error } = await supabase
    .from("cap_evento_asignaciones")
    .insert(usuariosAsignados.map((usuarioId) => ({ evento_id: eventoId, usuario_id: usuarioId })));
  if (error) throw error;
}

export async function confirmarEvento(
  id: string,
  usuarioId: string,
  drive: EventoCaptura["drive"]
): Promise<EventoCaptura> {
  const { data, error } = await supabase
    .from("cap_eventos")
    .update({ estado: "confirmado", confirmado_por: usuarioId, confirmado_en: new Date().toISOString(), drive })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return filaAEvento(data as FilaEvento);
}

/** Guarda los datos de Drive sin cerrar el evento: sigue abierto para seguir capturando. */
export async function actualizarDriveEvento(id: string, drive: EventoCaptura["drive"]): Promise<void> {
  const { error } = await supabase.from("cap_eventos").update({ drive }).eq("id", id);
  if (error) throw error;
}

export async function reabrirEvento(id: string, adminId: string, motivo: string): Promise<EventoCaptura> {
  const { data, error } = await supabase
    .from("cap_eventos")
    .update({ estado: "abierto", confirmado_por: null, confirmado_en: null })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  const { error: errLog } = await supabase
    .from("cap_eventos_reaperturas")
    .insert({ evento_id: id, admin_id: adminId, motivo });
  if (errLog) throw errLog;
  return filaAEvento(data as FilaEvento);
}

export async function eliminarEvento(id: string): Promise<void> {
  const { error } = await supabase.from("cap_eventos").delete().eq("id", id);
  // 23503 = llave foránea: un evento que se reabrió no se podía borrar hasta que la FK de reaperturas lleve ON DELETE CASCADE.
  if (error?.code === "23503") {
    throw new ErrorPeticion(409, "El evento tiene registros ligados que impiden borrarlo: corre supabase/captura-datos-borrado.sql en Supabase (relación de reaperturas).");
  }
  if (error) throw error;
}

// --- Hojas -------------------------------------------------------------

export async function crearHojas(
  eventoId: string,
  estatus: Estatus,
  hojas: { origen: FotoRef }[]
): Promise<HojaCaptura[]> {
  if (hojas.length === 0) return [];
  const { data, error } = await supabase
    .from("cap_hojas")
    .insert(hojas.map((h) => ({ evento_id: eventoId, estatus, origen: h.origen })))
    .select("*");
  if (error) throw error;
  return (data as FilaHoja[]).map(filaAHoja);
}

const TAMANO_PAGINA = 1000; // PostgREST corta en 1000 filas por consulta sin avisar: se pagina para no truncar

export async function listarHojasDeEvento(eventoId: string): Promise<HojaCaptura[]> {
  const filas: FilaHoja[] = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await supabase
      .from("cap_hojas")
      .select("*")
      .eq("evento_id", eventoId)
      .order("id")
      .range(desde, desde + TAMANO_PAGINA - 1);
    if (error) throw error;
    filas.push(...(data as FilaHoja[]));
    if (data.length < TAMANO_PAGINA) break;
  }
  return filas.map(filaAHoja);
}

export async function obtenerHoja(id: string): Promise<HojaCaptura | null> {
  const { data, error } = await supabase.from("cap_hojas").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? filaAHoja(data as FilaHoja) : null;
}

/** Toma la siguiente hoja libre del evento (bloqueo con skip-locked, ver tomar_hoja_libre en schema.sql). */
export async function tomarHojaLibre(eventoId: string, usuarioId: string): Promise<HojaCaptura | null> {
  const { data, error } = await supabase.rpc("tomar_hoja_libre", { p_evento: eventoId, p_usuario: usuarioId });
  if (error) throw error;
  const fila = data as FilaHoja | null;
  return fila?.id ? filaAHoja(fila) : null;
}

/**
 * Toma una hoja concreta (para abrirla desde su tarjeta). Mismo bloqueo que tomarHojaLibre: solo si sigue pendiente/leída
 * y nadie más la tiene vigente; si ya es tuya, se renueva. El UPDATE es atómico, así que dos personas no la toman a la vez.
 */
export async function tomarHojaPorId(id: string, usuarioId: string): Promise<HojaCaptura> {
  const ahora = new Date();
  const { data, error } = await supabase
    .from("cap_hojas")
    .update({ bloqueada_por: usuarioId, bloqueada_hasta: new Date(ahora.getTime() + BLOQUEO_MS).toISOString() })
    .eq("id", id)
    .in("estado", ["pendiente", "leida", "confirmada"]) // una confirmada se reabre para corregirla (solo con el evento abierto)
    .or(`bloqueada_por.is.null,bloqueada_por.eq.${usuarioId},bloqueada_hasta.lt.${ahora.toISOString()}`)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (data) return filaAHoja(data as FilaHoja);
  // No se pudo tomar: se distingue "ya no se edita" de "la tiene otra persona".
  const actual = await obtenerHoja(id);
  if (!actual) throw new ErrorPeticion(404, "Hoja no encontrada");
  if (actual.estado === "no_valida") throw new ErrorEstadoHoja();
  throw new ErrorHojaOcupada();
}

/** Libera la hoja solo si el bloqueo es de `usuarioId` (nadie libera el bloqueo de otra persona). */
export async function liberarHoja(id: string, usuarioId: string): Promise<void> {
  const { error } = await supabase
    .from("cap_hojas")
    .update({ bloqueada_por: null, bloqueada_hasta: null })
    .eq("id", id)
    .eq("bloqueada_por", usuarioId);
  if (error) throw error;
}

export const BLOQUEO_MS = 10 * 60 * 1000; // igual que el intervalo de tomar_hoja_libre

export class ErrorHojaOcupada extends Error {
  constructor() {
    super("Otra persona está editando esta hoja.");
  }
}

export class ErrorEstadoHoja extends Error {
  constructor() {
    super("Esta hoja ya no se puede editar (está confirmada o marcada como no válida).");
  }
}

export class ErrorVersion extends Error {
  constructor() {
    super("Esta hoja cambió mientras la editabas — recárgala antes de seguir.");
  }
}

/** Autoguardado: actualiza campos/voucherBox mientras la hoja está pendiente/leída. Bloqueo optimista por `version`. */
export async function actualizarCamposHoja(
  id: string,
  cambios: { campos?: SheetFields; voucherBox?: Box | null },
  versionEsperada?: number,
  usuarioId?: string
): Promise<HojaCaptura> {
  const { data: actual, error: errLectura } = await supabase
    .from("cap_hojas")
    .select("version, estado, bloqueada_por, bloqueada_hasta")
    .eq("id", id)
    .maybeSingle();
  if (errLectura) throw errLectura;
  if (!actual) throw new ErrorPeticion(404, "Hoja no encontrada");
  if (versionEsperada !== undefined && actual.version !== versionEsperada) throw new ErrorVersion();

  // Con usuarioId (autoguardado desde el editor): si otra persona tiene la hoja bloqueada y su bloqueo sigue vigente,
  // no se pisa; si es del mismo usuario (o ya expiró), cada guardado renueva el bloqueo.
  let renovar = {};
  if (usuarioId) {
    const vigente = actual.bloqueada_hasta && new Date(actual.bloqueada_hasta) > new Date();
    if (vigente && actual.bloqueada_por !== usuarioId) throw new ErrorHojaOcupada();
    renovar = { bloqueada_por: usuarioId, bloqueada_hasta: new Date(Date.now() + BLOQUEO_MS).toISOString() };
  }

  if (actual.estado !== "pendiente" && actual.estado !== "leida") throw new ErrorEstadoHoja();

  const nuevoEstado = actual.estado === "pendiente" ? "leida" : actual.estado;
  let consulta = supabase
    .from("cap_hojas")
    .update({
      ...(cambios.campos !== undefined ? { campos: cambios.campos } : {}),
      ...(cambios.voucherBox !== undefined ? { voucher_box: cambios.voucherBox } : {}),
      estado: nuevoEstado,
      version: actual.version + 1,
      ...renovar,
    })
    .eq("id", id)
    .eq("version", actual.version) // atómico: si otro guardado se coló entre la lectura y este update, no afecta filas
    .in("estado", ["pendiente", "leida"]);
  // El bloqueo también va en el UPDATE (no solo en la lectura de arriba): si B tomó la hoja justo después de leerla, no se pisa.
  if (usuarioId) consulta = consulta.or(`bloqueada_por.is.null,bloqueada_por.eq.${usuarioId},bloqueada_hasta.lt.${new Date().toISOString()}`);
  const { data, error } = await consulta.select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new ErrorVersion();
  return filaAHoja(data as FilaHoja);
}

export type DuplicadoFolio = { hojaId: string; eventoId: string; eventoNombre: string };

export class ErrorFolioDuplicado extends Error {
  constructor(public duplicado: DuplicadoFolio) {
    super(`El folio ya está registrado en "${duplicado.eventoNombre}"`);
  }
}

/** Hoja YA confirmada (en cualquier evento, no solo este) con el mismo folio — los folios son hojas impresas numeradas, un mismo número repetido es casi siempre un error de captura. */
export async function buscarFolioDuplicado(folio: string, excluirHojaId: string): Promise<DuplicadoFolio | null> {
  if (!folio) return null;
  const { data, error } = await supabase
    .from("cap_hojas")
    .select("id, evento_id, cap_eventos(nombre)")
    .eq("folio", folio)
    .eq("estado", "confirmada")
    .neq("id", excluirHojaId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const evento = data.cap_eventos as unknown as { nombre: string } | null;
  return { hojaId: data.id, eventoId: data.evento_id, eventoNombre: evento?.nombre ?? "otro evento" };
}

/** Confirma una hoja: valida los campos según su estatus y marca confirmada_por/en. */
export async function confirmarHoja(
  id: string,
  usuarioId: string,
  campos: SheetFields,
  voucherBox: Box | null,
  opts: { forzarDuplicado?: boolean; versionEsperada?: number } = {}
): Promise<HojaCaptura> {
  const { data: actual, error: errLectura } = await supabase
    .from("cap_hojas")
    .select("estatus, estado, version, bloqueada_por, bloqueada_hasta, campos")
    .eq("id", id)
    .maybeSingle();
  if (errLectura) throw errLectura;
  if (!actual) throw new ErrorPeticion(404, "Hoja no encontrada");
  if (actual.estado === "no_valida") throw new ErrorEstadoHoja();
  // Con la versión que vio el editor: un confirmar con datos viejos (tras expirar el bloqueo) no pisa un guardado más reciente.
  if (opts.versionEsperada !== undefined && actual.version !== opts.versionEsperada) throw new ErrorVersion();
  if (actual.bloqueada_hasta && new Date(actual.bloqueada_hasta) > new Date() && actual.bloqueada_por !== usuarioId) throw new ErrorHojaOcupada();

  const errores = validateFields(campos, actual.estatus as Estatus);
  if (Object.keys(errores).length > 0) {
    throw new ErrorPeticion(400, `Faltan datos: ${Object.values(errores)[0]}`);
  }

  if (!opts.forzarDuplicado) {
    const duplicado = await buscarFolioDuplicado(campos.folio, id);
    if (duplicado) {
      throw new ErrorFolioDuplicado(duplicado);
    }
  }

  const { data, error } = await supabase
    .from("cap_hojas")
    .update({
      campos,
      voucher_box: voucherBox,
      estado: "confirmada",
      confirmada_por: usuarioId,
      confirmada_en: new Date().toISOString(),
      bloqueada_por: null,
      bloqueada_hasta: null,
      version: actual.version + 1,
    })
    .eq("id", id)
    .eq("version", actual.version)
    .in("estado", ["pendiente", "leida", "confirmada"])
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ErrorVersion();

  // El historial se escribe DESPUÉS del update: si este falla (versión distinta), no queda un cambio falso registrado.
  if (actual.estado === "confirmada") {
    const { error: errHistorial } = await supabase
      .from("cap_hojas_historial")
      .insert({ hoja_id: id, usuario_id: usuarioId, antes: actual.campos ?? null, despues: campos });
    if (errHistorial) console.error("captura-datos: no se pudo registrar el historial de la hoja", id, errHistorial);
  }
  return filaAHoja(data as FilaHoja);
}

export async function marcarHojaNoValida(id: string, huella: string): Promise<void> {
  const { error } = await supabase
    .from("cap_hojas")
    .update({ estado: "no_valida", bloqueada_por: null, bloqueada_hasta: null })
    .eq("id", id)
    .in("estado", ["pendiente", "leida"]); // una hoja ya confirmada no se invalida desde aquí
  if (error) throw error;
  await marcarNoValida(huella);
}

/** Actualiza el origen de una hoja (ej. al subir su foto a Drive, se le agrega driveId). */
export async function actualizarOrigenHoja(id: string, origen: FotoRef): Promise<void> {
  const { error } = await supabase.from("cap_hojas").update({ origen }).eq("id", id);
  if (error) throw error;
}

export async function actualizarCarpetaFotosEvento(eventoId: string, carpetaFotosId: string): Promise<void> {
  const { error } = await supabase.from("cap_eventos").update({ carpeta_fotos_id: carpetaFotosId }).eq("id", eventoId);
  if (error) throw error;
}

/**
 * Reclama la única lectura con IA de la hoja (atómico: dos clics a la vez no gastan tokens dos veces).
 * Devuelve false si la hoja ya se leyó antes. La marca vive en `origen` (jsonb), así que no hace falta migración.
 */
export async function reclamarLecturaIa(id: string, origen: FotoRef): Promise<boolean> {
  const ahora = Date.now();
  const vencidas = new Date(ahora - LEASE_LECTURA_IA_MS).toISOString();
  const { data, error } = await supabase
    .from("cap_hojas")
    .update({ origen: { ...origen, leidaIa: true, leidaIaDesde: new Date(ahora).toISOString() } })
    .eq("id", id)
    // Sin lectura previa, o una reclamada hace más del LEASE que nunca terminó (la función murió a medias).
    .or(`origen->>leidaIa.is.null,origen->>leidaIaDesde.lt.${vencidas}`)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/** Devuelve la lectura cuando la IA no llegó a contestar (error de red o de la API): no se gastó nada. */
export async function devolverLecturaIa(id: string, origen: FotoRef): Promise<void> {
  const { error } = await supabase.from("cap_hojas").update({ origen: { ...origen, leidaIa: undefined, leidaIaDesde: undefined } }).eq("id", id);
  if (error) throw error;
}

/** La IA ya contestó y se guardó: la lectura queda gastada (se quita la marca de "en curso"). */
export async function finalizarLecturaIa(id: string, origen: FotoRef): Promise<void> {
  const { error } = await supabase.from("cap_hojas").update({ origen: { ...origen, leidaIa: true, leidaIaDesde: undefined } }).eq("id", id);
  if (error) throw error;
}

/**
 * Guarda una lectura adelantada solo si nadie tocó la hoja mientras la IA leía (sigue pendiente y sin datos);
 * así nunca pisa lo que alguien ya estaba escribiendo. Devuelve false si no se guardó.
 */
export async function guardarLecturaAdelantada(id: string, campos: SheetFields, voucherBox: Box | null, origen: FotoRef): Promise<boolean> {
  const { data: actual, error: errLectura } = await supabase.from("cap_hojas").select("version").eq("id", id).eq("estado", "pendiente").is("campos", null).maybeSingle();
  if (errLectura) throw errLectura;
  if (!actual) return false;
  const { data, error } = await supabase
    .from("cap_hojas")
    .update({ campos, voucher_box: voucherBox, estado: "leida", version: actual.version + 1, origen: { ...origen, leidaIa: true, leidaIaDesde: undefined } })
    .eq("id", id)
    .eq("version", actual.version)
    .eq("estado", "pendiente")
    .is("campos", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

const ORDEN_ESTATUS: Estatus[] = ["Completo", "Apartado", "Interesado"];

/** Las próximas `cantidad` hojas libres del evento, en el mismo orden en que las entrega tomar_hoja_libre (no las bloquea). */
export async function siguientesHojasLibres(eventoId: string, cantidad: number): Promise<HojaCaptura[]> {
  const ahora = new Date().toISOString();
  const hojas: HojaCaptura[] = [];
  for (const estatus of ORDEN_ESTATUS) {
    if (hojas.length >= cantidad) break;
    const { data, error } = await supabase
      .from("cap_hojas")
      .select("*")
      .eq("evento_id", eventoId)
      .eq("estatus", estatus)
      .in("estado", ["pendiente", "leida"])
      .or(`bloqueada_hasta.is.null,bloqueada_hasta.lt.${ahora}`)
      .order("id")
      .limit(cantidad - hojas.length);
    if (error) throw error;
    hojas.push(...(data as FilaHoja[]).map(filaAHoja));
  }
  return hojas;
}

export async function marcarNoValida(huella: string): Promise<void> {
  const { error } = await supabase.from("cap_imagenes_no_validas").upsert({ huella });
  if (error) throw error;
}

export async function esNoValida(huella: string): Promise<boolean> {
  const { data, error } = await supabase.from("cap_imagenes_no_validas").select("huella").eq("huella", huella).maybeSingle();
  if (error) throw error;
  return !!data;
}
