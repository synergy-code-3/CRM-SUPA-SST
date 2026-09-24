import { supabase } from "./supabase";
import { normalizarEmail, normalizarTelefono } from "./db";
import {
  type AbonoCertificacion,
  type ClienteCertificacion,
  type EstadoCertificacion,
  type EventoCertificacion,
  type MensajeBienvenidaCertificacion,
  type RegionCertificacion,
} from "./certificaciones-tipos";

// "Certificaciones" (Legendar-IA): roster independiente de clientes (Club
// Sinergético y Otras Ofertas) — ver supabase/schema.sql
// (certificaciones_clientes/eventos/abonos) y el plan de recreación de esta
// sección. Solo la base de socios ya confirmados: sin el pipeline de
// seguimiento/leads del CRM aparte del que se portó esto (sin estados
// SEGUIMIENTO/PENDIENTE_AUTORIZACION, sin alarmas ni SLA de vendedor).
// Tipos/constantes puros (RegionCertificacion, ClienteCertificacion, etc.)
// viven en certificaciones-tipos.ts, NO aquí — este archivo arrastra
// db.ts/boletos.ts (node:fs), y un componente cliente que solo necesita un
// tipo o una constante no debe cargar eso. Re-exportados abajo por
// conveniencia del lado del servidor.
export type {
  AbonoCertificacion,
  ClienteCertificacion,
  EstadoCertificacion,
  EventoCertificacion,
  MensajeBienvenidaCertificacion,
  RegionCertificacion,
};
export { REGIONES_CERTIFICACION, REGION_CERTIFICACION_LABEL } from "./certificaciones-tipos";

const MEMBRESIA_DIAS = 365;

type ClienteCertificacionRow = {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  telefono_busqueda: string | null;
  region: string | null;
  estado: string;
  notas: string | null;
  fecha_llegada: string;
  fecha_invitacion: string | null;
  fecha_aceptacion: string | null;
  fecha_vencimiento: string | null;
  mensaje_bienvenida: string;
  pausada: boolean;
  fecha_pausa: string | null;
  tags: string[] | null;
  etiquetas: string[] | null;
  vendedor: string | null;
  monto: string | null;
  total_abonado: number;
  fecha_primer_abono: string | null;
  creado_por: string;
  creado_por_rol: string;
  eliminado: boolean;
  fecha_eliminacion: string | null;
  creado_en: string;
};

function filaACliente(r: ClienteCertificacionRow): ClienteCertificacion {
  return {
    id: r.id,
    nombre: r.nombre,
    email: r.email,
    telefono: r.telefono,
    region: (r.region as RegionCertificacion) || null,
    estado: r.estado as EstadoCertificacion,
    notas: r.notas,
    fechaLlegada: r.fecha_llegada,
    fechaInvitacion: r.fecha_invitacion,
    fechaAceptacion: r.fecha_aceptacion,
    fechaVencimiento: r.fecha_vencimiento,
    mensajeBienvenida: r.mensaje_bienvenida as MensajeBienvenidaCertificacion,
    pausada: r.pausada,
    fechaPausa: r.fecha_pausa,
    tags: r.tags ?? [],
    etiquetas: r.etiquetas ?? [],
    vendedor: r.vendedor,
    monto: r.monto,
    totalAbonado: r.total_abonado ?? 0,
    fechaPrimerAbono: r.fecha_primer_abono,
    creadoPor: r.creado_por,
    creadoPorRol: r.creado_por_rol,
    eliminado: r.eliminado,
    fechaEliminacion: r.fecha_eliminacion,
    creadoEn: r.creado_en,
  };
}

type EventoCertificacionRow = { id: string; tipo: string; nota: string | null; autor: string; creado_en: string };
function filaAEvento(r: EventoCertificacionRow): EventoCertificacion {
  return { id: r.id, tipo: r.tipo, nota: r.nota, autor: r.autor, creadoEn: r.creado_en };
}

type AbonoCertificacionRow = {
  id: string;
  monto: number;
  moneda: string | null;
  nota: string | null;
  autor: string;
  creado_en: string;
};
function filaAAbono(r: AbonoCertificacionRow): AbonoCertificacion {
  return { id: r.id, monto: r.monto, moneda: r.moneda, nota: r.nota, autor: r.autor, creadoEn: r.creado_en };
}

// Últimos 10 dígitos de un teléfono, para reconocer al mismo cliente si el
// correo se corrigió y ya no hace match — mismo criterio que Legendaria.
export function ultimos10Digitos(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  const digitos = telefono.replace(/[^0-9]/g, "");
  return digitos.length < 10 ? null : digitos.slice(-10);
}

function fechaVencimientoDesde(desde: Date): Date {
  const v = new Date(desde);
  v.setDate(v.getDate() + MEMBRESIA_DIAS);
  return v;
}

async function registrarEventoCertificacion(
  clienteId: string,
  tipo: string,
  autor: string,
  nota?: string | null
): Promise<void> {
  const { error } = await supabase
    .from("certificaciones_eventos")
    .insert({ cliente_id: clienteId, tipo, autor, nota: nota || null });
  if (error) throw error;
}

export async function listarClientesCertificacion(): Promise<ClienteCertificacion[]> {
  const { data, error } = await supabase
    .from("certificaciones_clientes")
    .select("*")
    .eq("eliminado", false)
    .order("fecha_llegada", { ascending: false });
  if (error) throw error;
  return (data as ClienteCertificacionRow[]).map(filaACliente);
}

export type CriterioBusquedaCertificacion = "nombre" | "correo" | "telefono" | "notas" | "historial";
export const CRITERIOS_BUSQUEDA_CERTIFICACION: CriterioBusquedaCertificacion[] = [
  "nombre",
  "correo",
  "telefono",
  "notas",
  "historial",
];

const COLUMNA_POR_CRITERIO: Record<Exclude<CriterioBusquedaCertificacion, "historial">, string[]> = {
  nombre: ["nombre"],
  correo: ["email"],
  telefono: ["telefono", "telefono_busqueda"],
  notas: ["notas"],
};

// Ids de clientes (no eliminados) que cumplen una búsqueda de texto libre:
// cada palabra debe aparecer (en cualquier orden) en alguno de los criterios
// elegidos — columnas propias del cliente (nombre/correo/teléfono/notas) y/o
// el Historial (detalle de sus eventos de línea de tiempo, incluidas las
// notas agregadas a mano). Mismo criterio "todas las palabras" que la
// búsqueda de Clientes del Club. Se devuelven ids (no filas) porque la
// página ya tiene todos los clientes cargados y solo necesita saber cuáles
// mostrar.
// PostgREST devuelve como máximo 1000 filas por petición aunque se pida más
// (.limit(5000) se recorta) — se pide por páginas hasta agotar o llegar al tope.
async function traerPaginas<T>(
  pedir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  tope = 10000
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; desde < tope; desde += 1000) {
    const { data, error } = await pedir(desde, desde + 999);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return filas;
}

export async function buscarIdsCertificaciones(
  busqueda: string,
  criterios: CriterioBusquedaCertificacion[]
): Promise<string[]> {
  // Se quitan los caracteres reservados de PostgREST (coma, paréntesis,
  // comodines, comillas y barra invertida) para no romper el filtro or().
  const palabras = busqueda
    .replace(/[,%*()"\\]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (palabras.length === 0) return [];

  const columnas = criterios.flatMap((c) => (c === "historial" ? [] : COLUMNA_POR_CRITERIO[c]));
  const incluyeHistorial = criterios.includes("historial");

  let resultado = null as Set<string> | null;
  for (const palabra of palabras) {
    const coincidencias = new Set<string>();

    if (columnas.length) {
      const filas = await traerPaginas<{ id: string }>((desde, hasta) =>
        supabase
          .from("certificaciones_clientes")
          .select("id")
          .eq("eliminado", false)
          .or(columnas.map((c) => `${c}.ilike.%${palabra}%`).join(","))
          .order("id")
          .range(desde, hasta)
      );
      for (const f of filas) coincidencias.add(f.id);
    }

    if (incluyeHistorial) {
      const filas = await traerPaginas<{ cliente_id: string }>((desde, hasta) =>
        supabase
          .from("certificaciones_eventos")
          .select("cliente_id")
          .ilike("nota", `%${palabra}%`)
          .order("id")
          .range(desde, hasta)
      );
      for (const f of filas) coincidencias.add(f.cliente_id);
    }

    resultado = resultado ? new Set([...resultado].filter((id) => coincidencias.has(id))) : coincidencias;
    if (resultado.size === 0) break;
  }
  return [...(resultado ?? [])];
}

export type ActividadCertificacion = {
  id: string;
  clienteId: string;
  clienteNombre: string;
  email: string | null;
  telefono: string | null;
  vendedor: string | null;
  etiquetas: string[];
  accion: string;
  autor: string;
  nota: string | null;
  fecha: string;
};

// Bitácora de Certificaciones: los eventos de línea de tiempo de TODOS los
// clientes en un rango de fechas, con los datos del cliente pegados (para
// filtrar por vendedor/certificación y exportar). Tope de 5000 filas.
export async function listarActividadCertificacion(opciones: {
  desde: string;
  hasta: string;
  autor?: string;
}): Promise<{ resultados: ActividadCertificacion[]; autores: string[] }> {
  let query = supabase
    .from("certificaciones_eventos")
    .select("id,cliente_id,tipo,nota,autor,creado_en,cliente:certificaciones_clientes(nombre,email,telefono,vendedor,etiquetas)")
    .gte("creado_en", opciones.desde)
    .lte("creado_en", opciones.hasta)
    .order("creado_en", { ascending: false })
    .limit(5000);
  if (opciones.autor) query = query.eq("autor", opciones.autor);
  const { data, error } = await query;
  if (error) throw error;

  type Fila = {
    id: string;
    cliente_id: string;
    tipo: string;
    nota: string | null;
    autor: string;
    creado_en: string;
    cliente: { nombre: string; email: string | null; telefono: string | null; vendedor: string | null; etiquetas: string[] | null } | { nombre: string; email: string | null; telefono: string | null; vendedor: string | null; etiquetas: string[] | null }[] | null;
  };
  const resultados = ((data ?? []) as unknown as Fila[]).map((f) => {
    const c = Array.isArray(f.cliente) ? f.cliente[0] : f.cliente;
    return {
      id: f.id,
      clienteId: f.cliente_id,
      clienteNombre: c?.nombre ?? f.cliente_id,
      email: c?.email ?? null,
      telefono: c?.telefono ?? null,
      vendedor: c?.vendedor ?? null,
      etiquetas: c?.etiquetas ?? [],
      accion: f.tipo,
      autor: f.autor,
      nota: f.nota,
      fecha: f.creado_en,
    };
  });

  // Autores para el filtro: usuarios del CRM + quienes aparecen en eventos
  // recientes (la sincronización con la hoja firma con el vendedor).
  const [{ data: usuarios }, { data: recientes }] = await Promise.all([
    supabase.from("usuarios").select("nombre"),
    supabase.from("certificaciones_eventos").select("autor").order("creado_en", { ascending: false }).limit(3000),
  ]);
  const autores = new Set<string>();
  for (const u of usuarios ?? []) if (u.nombre) autores.add(u.nombre as string);
  for (const e of recientes ?? []) if (e.autor) autores.add(e.autor as string);

  return { resultados, autores: Array.from(autores).sort((a, b) => a.localeCompare(b)) };
}

export async function listarPapeleraCertificacion(): Promise<ClienteCertificacion[]> {
  const { data, error } = await supabase
    .from("certificaciones_clientes")
    .select("*")
    .eq("eliminado", true)
    .order("fecha_eliminacion", { ascending: false });
  if (error) throw error;
  return (data as ClienteCertificacionRow[]).map(filaACliente);
}

export async function obtenerClienteCertificacion(id: string): Promise<ClienteCertificacion | null> {
  const { data, error } = await supabase
    .from("certificaciones_clientes")
    .select("*")
    .eq("id", normalizarEmail(id))
    .maybeSingle();
  if (error) throw error;
  return data ? filaACliente(data as ClienteCertificacionRow) : null;
}

export async function buscarClienteCertificacionPorCorreo(correo: string): Promise<ClienteCertificacion | null> {
  return obtenerClienteCertificacion(correo);
}

// Para el cruce con el perfil de Club Sinergético (ver /api/clientes/[id])
// — nada más si el correo también es socio de Certificaciones, sin traer
// el registro completo.
export async function existeClienteCertificacion(correo: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("certificaciones_clientes")
    .select("id")
    .eq("id", normalizarEmail(correo))
    .eq("eliminado", false)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function eventosCertificacion(clienteId: string): Promise<EventoCertificacion[]> {
  const { data, error } = await supabase
    .from("certificaciones_eventos")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("creado_en", { ascending: true });
  if (error) throw error;
  return (data as EventoCertificacionRow[]).map(filaAEvento);
}

export async function abonosCertificacion(clienteId: string): Promise<AbonoCertificacion[]> {
  const { data, error } = await supabase
    .from("certificaciones_abonos")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("creado_en", { ascending: true });
  if (error) throw error;
  return (data as AbonoCertificacionRow[]).map(filaAAbono);
}

export type CrearClienteCertificacionInput = {
  nombre: string;
  email?: string | null;
  telefono?: string | null;
  region?: RegionCertificacion | null;
  notas?: string | null;
  monto?: string | null;
  etiquetas?: string[];
  tags?: string[];
  vendedor?: string | null;
  // Fecha de ingreso (importación CSV con fecha_inscripcion) — por defecto hoy.
  fechaLlegada?: string | null;
  // "csv" registra el evento IMPORTACION en vez de LLEGADA.
  origen?: "csv";
};

export async function crearClienteCertificacion(
  input: CrearClienteCertificacionInput,
  autor: string,
  autorRol: string
): Promise<ClienteCertificacion> {
  if (!input.email?.trim()) throw new Error("Falta el correo");
  const id = normalizarEmail(input.email);
  const fechaLlegada = input.fechaLlegada ? new Date(input.fechaLlegada) : new Date();
  if (Number.isNaN(fechaLlegada.getTime())) throw new Error("Fecha de ingreso inválida");

  const { data, error } = await supabase
    .from("certificaciones_clientes")
    .insert({
      id,
      nombre: input.nombre.trim(),
      email: id,
      telefono: normalizarTelefono(input.telefono ?? null),
      telefono_busqueda: ultimos10Digitos(input.telefono),
      region: input.region ?? null,
      estado: "NUEVO",
      notas: input.notas?.trim() || null,
      fecha_llegada: fechaLlegada.toISOString(),
      fecha_vencimiento: fechaVencimientoDesde(fechaLlegada).toISOString(),
      etiquetas: input.etiquetas?.length ? Array.from(new Set(input.etiquetas)) : [],
      tags: input.tags?.length ? Array.from(new Set(input.tags)) : [],
      vendedor: input.vendedor?.trim() || null,
      monto: input.monto?.trim() || null,
      creado_por: autor,
      creado_por_rol: autorRol,
    })
    .select("*")
    .single();
  if (error) throw error;

  const cliente = filaACliente(data as ClienteCertificacionRow);
  if (input.origen === "csv") await registrarEventoCertificacion(id, "IMPORTACION", autor, "Cliente importado por CSV");
  else await registrarEventoCertificacion(id, "LLEGADA", autor, "Cliente registrado en Certificaciones");
  return cliente;
}

export type CambiosDatosCertificacion = {
  nombre: string;
  email?: string | null;
  telefono?: string | null;
  region?: RegionCertificacion | null;
  notas?: string | null;
  monto?: string | null;
};

export async function actualizarDatosCertificacion(
  id: string,
  cambios: CambiosDatosCertificacion,
  autor: string
): Promise<ClienteCertificacion> {
  const anterior = await obtenerClienteCertificacion(id);
  if (!anterior) throw new Error("Cliente no encontrado");

  const telefono = normalizarTelefono(cambios.telefono ?? null);
  const { data, error } = await supabase
    .from("certificaciones_clientes")
    .update({
      nombre: cambios.nombre.trim(),
      email: cambios.email?.trim() || null,
      telefono,
      telefono_busqueda: ultimos10Digitos(cambios.telefono),
      region: cambios.region ?? null,
      notas: cambios.notas?.trim() || null,
      monto: cambios.monto?.trim() || null,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;

  const CAMPOS: { label: string; anterior: string; nuevo: string }[] = [
    { label: "Nombre", anterior: anterior.nombre, nuevo: cambios.nombre },
    { label: "Correo", anterior: anterior.email ?? "—", nuevo: cambios.email || "—" },
    { label: "Teléfono", anterior: anterior.telefono ?? "—", nuevo: telefono ?? "—" },
    { label: "Región", anterior: anterior.region ?? "—", nuevo: cambios.region ?? "—" },
    { label: "Notas", anterior: anterior.notas ?? "—", nuevo: cambios.notas || "—" },
    { label: "Monto", anterior: anterior.monto ?? "—", nuevo: cambios.monto || "—" },
  ];
  const nota = CAMPOS.filter((c) => c.anterior !== c.nuevo)
    .map((c) => `${c.label}: "${c.anterior}" → "${c.nuevo}"`)
    .join(" · ");
  if (nota) await registrarEventoCertificacion(id, "EDICION", autor, nota);

  return filaACliente(data as ClienteCertificacionRow);
}

export async function agregarNotaCertificacion(id: string, nota: string, autor: string): Promise<void> {
  const cliente = await obtenerClienteCertificacion(id);
  if (!cliente) throw new Error("Cliente no encontrado");
  await registrarEventoCertificacion(id, "NOTA", autor, nota.trim());
}

export async function agregarTagsCertificacion(id: string, tags: string[], autor: string): Promise<void> {
  const cliente = await obtenerClienteCertificacion(id);
  if (!cliente) throw new Error("Cliente no encontrado");
  const unicos = Array.from(new Set([...cliente.tags, ...tags.map((t) => t.trim()).filter(Boolean)]));
  if (unicos.length === cliente.tags.length) return;
  const { error } = await supabase.from("certificaciones_clientes").update({ tags: unicos }).eq("id", id);
  if (error) throw error;
  await registrarEventoCertificacion(id, "TAGS", autor, `Se agregaron tags: ${tags.join(", ")}`);
}

export async function quitarTagCertificacion(id: string, tag: string, autor: string): Promise<void> {
  const cliente = await obtenerClienteCertificacion(id);
  if (!cliente) throw new Error("Cliente no encontrado");
  const restantes = cliente.tags.filter((t) => t !== tag);
  const { error } = await supabase.from("certificaciones_clientes").update({ tags: restantes }).eq("id", id);
  if (error) throw error;
  await registrarEventoCertificacion(id, "TAGS", autor, `Se quitó el tag: ${tag}`);
}

export async function agregarEtiquetasCertificacion(id: string, etiquetas: string[], autor: string): Promise<void> {
  const cliente = await obtenerClienteCertificacion(id);
  if (!cliente) throw new Error("Cliente no encontrado");
  const unicas = Array.from(new Set([...cliente.etiquetas, ...etiquetas.map((e) => e.trim()).filter(Boolean)]));
  if (unicas.length === cliente.etiquetas.length) return;
  const { error } = await supabase.from("certificaciones_clientes").update({ etiquetas: unicas }).eq("id", id);
  if (error) throw error;
  await registrarEventoCertificacion(id, "ETIQUETAS", autor, `Se agregó a: ${etiquetas.join(", ")}`);
}

export async function quitarEtiquetaCertificacion(id: string, etiqueta: string, autor: string): Promise<void> {
  const cliente = await obtenerClienteCertificacion(id);
  if (!cliente) throw new Error("Cliente no encontrado");
  const restantes = cliente.etiquetas.filter((e) => e !== etiqueta);
  const { error } = await supabase.from("certificaciones_clientes").update({ etiquetas: restantes }).eq("id", id);
  if (error) throw error;
  await registrarEventoCertificacion(id, "ETIQUETAS", autor, `Se quitó: ${etiqueta}`);
}

export async function registrarAbonoCertificacion(
  clienteId: string,
  autor: string,
  monto: number,
  moneda: string | null,
  nota: string | null
): Promise<void> {
  const cliente = await obtenerClienteCertificacion(clienteId);
  if (!cliente) throw new Error("Cliente no encontrado");
  const esPrimerAbono = cliente.totalAbonado === 0;
  const ahora = new Date().toISOString();

  const { error: errAbono } = await supabase
    .from("certificaciones_abonos")
    .insert({ cliente_id: clienteId, monto, moneda, nota, autor });
  if (errAbono) throw errAbono;

  const { error: errUpdate } = await supabase
    .from("certificaciones_clientes")
    .update({
      total_abonado: cliente.totalAbonado + monto,
      ...(esPrimerAbono ? { fecha_primer_abono: ahora } : {}),
    })
    .eq("id", clienteId);
  if (errUpdate) throw errUpdate;

  await registrarEventoCertificacion(
    clienteId,
    "ABONO",
    autor,
    `Abono de ${monto}${moneda ? ` ${moneda}` : ""}${nota ? ` — ${nota}` : ""}`
  );
}

export async function enviarInvitacionCertificacion(id: string, autor: string): Promise<void> {
  // Solo desde NUEVO: reenviar el aviso a Skool a alguien ya invitado/activo
  // tiene su propia acción (reenviar-skool) y no debe reiniciar su estado.
  const cliente = await obtenerClienteCertificacion(id);
  if (!cliente) throw new Error("Cliente no encontrado");
  if (cliente.estado !== "NUEVO") throw new Error("A este cliente ya se le envió la invitación");
  const { error } = await supabase
    .from("certificaciones_clientes")
    .update({ estado: "INVITACION_ENVIADA", fecha_invitacion: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await registrarEventoCertificacion(id, "INVITACION_ENVIADA", autor, "Invitación enviada al cliente");
}

export async function marcarInvitacionAceptadaCertificacion(id: string, autor: string): Promise<void> {
  // Solo desde "invitación enviada": si no, un NUEVO se saltaría la invitación y
  // un ACTIVO/VENCIDO perdería su fecha de aceptación original.
  const cliente = await obtenerClienteCertificacion(id);
  if (!cliente) throw new Error("Cliente no encontrado");
  if (cliente.estado !== "INVITACION_ENVIADA") {
    throw new Error("Este cliente no tiene una invitación pendiente de aceptar");
  }
  const { error } = await supabase
    .from("certificaciones_clientes")
    .update({ estado: "ACTIVO", fecha_aceptacion: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await registrarEventoCertificacion(id, "INVITACION_ACEPTADA", autor, "El cliente aceptó la invitación");
}

export async function pausarMembresiaCertificacion(id: string, autor: string): Promise<void> {
  const { error } = await supabase
    .from("certificaciones_clientes")
    .update({ pausada: true, fecha_pausa: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await registrarEventoCertificacion(id, "PAUSA", autor, "Se pausó el temporizador de la membresía");
}

export async function reanudarMembresiaCertificacion(id: string, autor: string): Promise<void> {
  const cliente = await obtenerClienteCertificacion(id);
  if (!cliente) throw new Error("Cliente no encontrado");
  if (!cliente.fechaVencimiento || !cliente.fechaPausa) throw new Error("Este cliente no está pausado");

  const msPausada = Date.now() - new Date(cliente.fechaPausa).getTime();
  const nuevoVencimiento = new Date(new Date(cliente.fechaVencimiento).getTime() + msPausada);

  const { error } = await supabase
    .from("certificaciones_clientes")
    .update({ pausada: false, fecha_pausa: null, fecha_vencimiento: nuevoVencimiento.toISOString() })
    .eq("id", id);
  if (error) throw error;
  await registrarEventoCertificacion(id, "REANUDACION", autor, "Se reanudó el temporizador de la membresía");
}

export async function renovarMembresiaCertificacion(id: string, autor: string): Promise<void> {
  const cliente = await obtenerClienteCertificacion(id);
  if (!cliente) throw new Error("Cliente no encontrado");
  const base = cliente.fechaVencimiento ? new Date(cliente.fechaVencimiento) : new Date();
  const nuevoVencimiento = fechaVencimientoDesde(base);

  const { error } = await supabase
    .from("certificaciones_clientes")
    .update({ estado: "ACTIVO", fecha_vencimiento: nuevoVencimiento.toISOString(), pausada: false, fecha_pausa: null })
    .eq("id", id);
  if (error) throw error;
  await registrarEventoCertificacion(
    id,
    "RENOVACION",
    autor,
    `Membresía renovada por 1 año más — nuevo vencimiento: ${nuevoVencimiento.toLocaleDateString("es-MX")}`
  );
}

const ESTADOS_BIENVENIDA_VALIDOS: MensajeBienvenidaCertificacion[] = ["PENDIENTE", "ENVIADA", "INVALIDO"];
const BIENVENIDA_LABEL: Record<MensajeBienvenidaCertificacion, string> = {
  PENDIENTE: "Pendiente",
  ENVIADA: "Enviada",
  INVALIDO: "Número inválido",
};

export async function establecerMensajeBienvenidaCertificacion(
  id: string,
  estado: MensajeBienvenidaCertificacion,
  autor: string
): Promise<void> {
  if (!ESTADOS_BIENVENIDA_VALIDOS.includes(estado)) throw new Error("Estado de bienvenida inválido");
  const cliente = await obtenerClienteCertificacion(id);
  if (!cliente) throw new Error("Cliente no encontrado");
  if (cliente.mensajeBienvenida === estado) return;

  const { error } = await supabase.from("certificaciones_clientes").update({ mensaje_bienvenida: estado }).eq("id", id);
  if (error) throw error;
  await registrarEventoCertificacion(id, "MENSAJE_BIENVENIDA", autor, `Mensaje de bienvenida: ${BIENVENIDA_LABEL[estado]}`);
}

export async function establecerVendedorCertificacion(id: string, vendedor: string | null, autor: string): Promise<void> {
  const cliente = await obtenerClienteCertificacion(id);
  if (!cliente) throw new Error("Cliente no encontrado");
  const nuevo = vendedor?.trim() || null;
  if (nuevo === cliente.vendedor) return;

  const { error } = await supabase.from("certificaciones_clientes").update({ vendedor: nuevo }).eq("id", id);
  if (error) throw error;
  await registrarEventoCertificacion(
    id,
    "VENDEDOR",
    autor,
    nuevo ? `Vendedor: ${cliente.vendedor ?? "sin asignar"} → ${nuevo}` : "Se quitó el vendedor asignado"
  );
}

// "agregar" suma días a la fecha de vencimiento actual (Agregar 30 días /
// personalizados); "corregir" la fija a N días desde hoy (o desde el momento
// en que se pausó, si está pausada — así el contador congelado marca justo
// N días). Pensado para arreglar el temporizador a mano.
export async function ajustarDiasCertificacion(
  id: string,
  accion: "agregar" | "corregir",
  dias: number,
  autor: string
): Promise<void> {
  if (!Number.isInteger(dias) || dias < 0 || (accion === "agregar" && dias === 0) || dias > 3650) {
    throw new Error("Los días deben ser un número entero válido");
  }
  const cliente = await obtenerClienteCertificacion(id);
  if (!cliente) throw new Error("Cliente no encontrado");

  const MS_DIA = 24 * 60 * 60 * 1000;
  let nuevoVencimiento: Date;
  if (accion === "agregar") {
    // Si ya venció, los días se cuentan desde hoy (si no, "agregar 30 días" a
    // alguien vencido hace 60 días lo dejaría igual de vencido). Pausada: se
    // suma al vencimiento guardado, que es el que se reanuda.
    const vencimiento = cliente.fechaVencimiento ? new Date(cliente.fechaVencimiento) : new Date();
    const base = cliente.pausada ? vencimiento : new Date(Math.max(vencimiento.getTime(), Date.now()));
    nuevoVencimiento = new Date(base.getTime() + dias * MS_DIA);
  } else {
    const referencia = cliente.pausada && cliente.fechaPausa ? new Date(cliente.fechaPausa) : new Date();
    nuevoVencimiento = new Date(referencia.getTime() + dias * MS_DIA);
  }

  const { error } = await supabase
    .from("certificaciones_clientes")
    .update({ fecha_vencimiento: nuevoVencimiento.toISOString() })
    .eq("id", id);
  if (error) throw error;
  await registrarEventoCertificacion(
    id,
    "EXTENSION",
    autor,
    accion === "agregar"
      ? `Se agregaron ${dias} días — nuevo vencimiento: ${nuevoVencimiento.toLocaleDateString("es-MX")}`
      : `Días restantes corregidos a ${dias} — nuevo vencimiento: ${nuevoVencimiento.toLocaleDateString("es-MX")}`
  );
}

// Deshace el último paso del ciclo de invitación: ACTIVO → INVITACION_ENVIADA
// (quita la fecha de aceptación) o INVITACION_ENVIADA → NUEVO (quita la de
// invitación). No toca la fecha de vencimiento.
export async function deshacerCertificacion(id: string, que: "aceptacion" | "invitacion", autor: string): Promise<void> {
  const cliente = await obtenerClienteCertificacion(id);
  if (!cliente) throw new Error("Cliente no encontrado");

  if (que === "aceptacion") {
    if (cliente.estado !== "ACTIVO" && cliente.estado !== "VENCIDO") throw new Error("Este cliente no tiene la invitación aceptada");
    const { error } = await supabase
      .from("certificaciones_clientes")
      .update({ estado: "INVITACION_ENVIADA", fecha_aceptacion: null })
      .eq("id", id);
    if (error) throw error;
    await registrarEventoCertificacion(id, "RESTAURACION", autor, "Se deshizo la aceptación de la invitación");
  } else {
    if (cliente.estado !== "INVITACION_ENVIADA") throw new Error("Este cliente no tiene una invitación pendiente de aceptar");
    const { error } = await supabase
      .from("certificaciones_clientes")
      .update({ estado: "NUEVO", fecha_invitacion: null })
      .eq("id", id);
    if (error) throw error;
    await registrarEventoCertificacion(id, "RESTAURACION", autor, "Se deshizo el envío de la invitación");
  }
}

export async function eliminarClienteCertificacion(id: string, autor: string): Promise<void> {
  const { error } = await supabase
    .from("certificaciones_clientes")
    .update({ eliminado: true, fecha_eliminacion: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await registrarEventoCertificacion(id, "PAPELERA", autor, "Cliente enviado a la papelera");
}

export async function restaurarClienteCertificacion(id: string, autor: string): Promise<void> {
  const { error } = await supabase
    .from("certificaciones_clientes")
    .update({ eliminado: false, fecha_eliminacion: null })
    .eq("id", id);
  if (error) throw error;
  await registrarEventoCertificacion(id, "RESTAURACION_PAPELERA", autor, "Cliente restaurado desde la papelera");
}

export async function eliminarClienteCertificacionPermanente(id: string): Promise<void> {
  const { error } = await supabase.from("certificaciones_clientes").delete().eq("id", id);
  if (error) throw error;
}
