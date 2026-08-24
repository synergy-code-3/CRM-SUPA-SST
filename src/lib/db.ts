import { supabase } from "./supabase";
import { calcularVencimientoSkool, formatearFechaSkool, parsearFechaSkool } from "./fechas";
import { cargarInventarioBoletos, cargarPaisPorEvento, cargarTipoPorEvento, calcularAccesos, regionDeCliente } from "./boletos";
import { obtenerPerfilKajabi } from "./kajabi";
import { filaACliente, fechaSkoolADateOnly, type ClienteRow } from "./supabase-map";
import type {
  Accesos,
  Cliente,
  EstadoMensajeBienvenidaWa,
  EventoTimeline,
  OfertaOtorgada,
  OtraOfertaCliente,
  TipoEvento,
  Variante,
} from "./types";

const PAGINA_INTERNA = 1000;

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Los CSV masivos suelen traer el teléfono como "525512345678" (lada +
// número, sin el "+"). Se antepone si falta para que quede en formato E.164
// — lo necesitan tanto el envío de WhatsApp por GHL como los links de
// wa.me/tel: del panel del cliente.
export function normalizarTelefono(telefono?: string | null): string | null {
  const limpio = telefono?.trim();
  if (!limpio) return null;
  return limpio.startsWith("+") ? limpio : `+${limpio}`;
}

async function registrarEvento(
  clienteId: string,
  tipo: TipoEvento,
  detalle: string,
  autor: string
): Promise<void> {
  const { error } = await supabase
    .from("eventos_timeline")
    .insert({ cliente_id: clienteId, tipo, detalle, autor });
  if (error) throw error;
}

// Trae todas las filas de una tabla paginando de PAGINA_INTERNA en
// PAGINA_INTERNA (PostgREST limita cada respuesta a 1000 filas por
// defecto). Se usa solo para agregaciones internas (dashboard, opciones de
// filtro), nunca para listas paginadas de cara al usuario.
async function traerTodo<T>(
  construir: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const todo: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + PAGINA_INTERNA - 1;
    const { data, error } = await construir(from, to);
    if (error) throw error;
    todo.push(...(data ?? []));
    if (!data || data.length < PAGINA_INTERNA) break;
    from += PAGINA_INTERNA;
  }
  return todo;
}

// Solo los campos que usa el dashboard (api/resumen) para sus agregaciones.
export type ClienteResumen = Pick<
  Cliente,
  "id" | "nombre" | "fechaInscripcion" | "creadoEn" | "accesoPlataforma" | "tipoMembresia" | "vencimientoSkool" | "accesos"
>;

type FilaResumen = Pick<
  ClienteRow,
  "id" | "nombre" | "fecha_inscripcion" | "creado_en" | "acceso_plataforma" | "tipo_membresia" | "vencimiento_skool" | "accesos"
>;

export async function listarTodosClientes(): Promise<ClienteResumen[]> {
  const filas = await traerTodo<FilaResumen>((from, to) =>
    supabase
      .from("clientes")
      .select("id,nombre,fecha_inscripcion,creado_en,acceso_plataforma,tipo_membresia,vencimiento_skool,accesos")
      .is("eliminado_en", null)
      .range(from, to)
  );
  return filas.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    fechaInscripcion: r.fecha_inscripcion,
    creadoEn: r.creado_en,
    accesoPlataforma: r.acceso_plataforma,
    tipoMembresia: r.tipo_membresia,
    vencimientoSkool: r.vencimiento_skool,
    accesos: r.accesos,
  }));
}

export type EstadoFiltro = "todos" | "activos" | "revocados";
export type RegionFiltro = "todos" | "MX" | "US" | "LATAM";
export type VigenciaFiltro = "actuales" | "futuros" | "todos";
export type TipoEventoFiltro = "todos" | "webinar" | "presencial";

export type FiltrosClientes = {
  busqueda?: string;
  estado?: EstadoFiltro;
  region?: RegionFiltro;
  eventos?: string[];
  tipoEvento?: TipoEventoFiltro;
  membresias?: string[];
  desde?: string;
  hasta?: string;
  vencidosAntesDe?: string;
  vigencia?: VigenciaFiltro;
  limite?: number;
  pagina?: number;
};

// Resuelve el filtro Webinar/Presencial a una lista concreta de nombres de
// evento (columna "Tipo de Evento" del inventario de boletos) y la combina
// con el filtro de eventos ya elegido a mano, si lo hay (intersección — solo
// los eventos que cumplen ambos). Si la combinación no deja ningún evento,
// se fuerza una lista con un nombre que no existe para que el `.in()` de
// abajo no matchee nada, en vez de ignorarse (el guard `.length` de
// aplicarFiltrosClientes solo aplica el filtro si el arreglo no está vacío).
async function resolverFiltroTipoEvento(opciones?: FiltrosClientes): Promise<FiltrosClientes | undefined> {
  if (!opciones?.tipoEvento || opciones.tipoEvento === "todos") return opciones;

  const [tipoPorEvento, { eventos: todosLosEventos }] = await Promise.all([
    cargarTipoPorEvento(),
    listarOpcionesFiltro(),
  ]);
  const buscado = opciones.tipoEvento === "webinar" ? "WEBINAR" : "PRES";
  const eventosDelTipo = todosLosEventos.filter((e) => tipoPorEvento.get(e.trim().toLowerCase()) === buscado);

  const eventosFinales = opciones.eventos?.length
    ? opciones.eventos.filter((e) => eventosDelTipo.includes(e))
    : eventosDelTipo;

  return { ...opciones, eventos: eventosFinales.length ? eventosFinales : ["__ningún evento coincide__"] };
}

// Quita comas (separador de condiciones en `.or()`), paréntesis (agrupan
// lógica anidada en ese mismo DSL) y comodines de ILIKE del texto libre de
// búsqueda — cualquiera de esos caracteres rompe el parseo del filtro en
// PostgREST (probado: buscar "algo)" tira un error 500 en vez de resultados).
function sanearBusqueda(q: string): string {
  return q.replace(/[,%*()]/g, "");
}

// Aplica los filtros de la lista de clientes (búsqueda, estado, región,
// eventos, membresías, rango de fechas, vigencia) a una query ya iniciada
// con .from("clientes").select(...). Compartida entre listarClientes
// (paginada) y exportarClientes (trae todo lo que matchee) para no duplicar
// la lógica de filtros entre las dos.
function aplicarFiltrosClientes<
  Q extends {
    or: (s: string) => Q;
    ilike: (columna: string, valor: string) => Q;
    eq: (columna: string, valor: string) => Q;
    in: (columna: string, valores: string[]) => Q;
    gte: (columna: string, valor: string) => Q;
    lte: (columna: string, valor: string) => Q;
    lt: (columna: string, valor: string) => Q;
    gt: (columna: string, valor: string) => Q;
  },
>(query: Q, opciones?: FiltrosClientes): Q {
  const ahora = new Date().toISOString();
  const vigencia = opciones?.vigencia ?? "actuales";

  const q = sanearBusqueda(opciones?.busqueda?.trim() ?? "");
  if (q) query = query.or(`nombre.ilike.%${q}%,email.ilike.%${q}%`);

  if (opciones?.estado === "activos") query = query.ilike("acceso_plataforma", "si");
  if (opciones?.estado === "revocados") query = query.ilike("acceso_plataforma", "revocado");

  if (opciones?.region && opciones.region !== "todos") query = query.eq("region", opciones.region);

  if (opciones?.eventos?.length) query = query.in("evento", opciones.eventos);
  if (opciones?.membresias?.length) query = query.in("tipo_membresia", opciones.membresias);

  if (opciones?.desde) query = query.gte("fecha_inscripcion", opciones.desde);
  if (opciones?.hasta) query = query.lte("fecha_inscripcion", opciones.hasta);

  if (opciones?.vencidosAntesDe) query = query.lt("vencimiento_skool_fecha", opciones.vencidosAntesDe);

  if (vigencia === "actuales") query = query.or(`fecha_inscripcion.is.null,fecha_inscripcion.lte.${ahora}`);
  if (vigencia === "futuros") query = query.gt("fecha_inscripcion", ahora);

  return query;
}

export async function listarClientes(opcionesCrudas?: FiltrosClientes): Promise<{
  clientes: Cliente[];
  total: number;
}> {
  const opciones = await resolverFiltroTipoEvento(opcionesCrudas);
  const limite = opciones?.limite ?? 100;
  const pagina = Math.max(1, opciones?.pagina ?? 1);
  const inicio = (pagina - 1) * limite;

  let query = supabase.from("clientes").select("*", { count: "exact" }).is("eliminado_en", null);
  query = aplicarFiltrosClientes(query, opciones);
  query = query.order("orden_csv", { ascending: false }).range(inicio, inicio + limite - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  return { clientes: (data as ClienteRow[]).map(filaACliente), total: count ?? 0 };
}

const CAP_EXPORTACION = 50_000;

// Trae TODOS los clientes que matcheen los filtros (sin paginar), para el
// botón "Descargar CSV" — a diferencia de listarClientes, que solo trae la
// página actual. Usa el mismo traerTodo() que ya pagina de a 1000 filas
// (límite de PostgREST) para las agregaciones del dashboard.
export async function exportarClientes(opcionesCrudas?: FiltrosClientes): Promise<Cliente[]> {
  const opciones = await resolverFiltroTipoEvento(opcionesCrudas);
  const filas = await traerTodo<ClienteRow>((from, to) => {
    let query = supabase.from("clientes").select("*").is("eliminado_en", null);
    query = aplicarFiltrosClientes(query, opciones);
    return query.order("orden_csv", { ascending: false }).range(from, to);
  });
  if (filas.length > CAP_EXPORTACION) {
    throw new Error("Demasiados resultados para exportar — aplica filtros para reducir la lista.");
  }
  return filas.map(filaACliente);
}

export async function listarOpcionesFiltro(): Promise<{ eventos: string[]; membresias: string[] }> {
  const filas = await traerTodo<{ evento: string | null; tipo_membresia: string | null }>((from, to) =>
    supabase.from("clientes").select("evento,tipo_membresia").range(from, to)
  );
  const eventos = new Set<string>();
  const membresias = new Set<string>();
  for (const f of filas) {
    if (f.evento) eventos.add(f.evento);
    if (f.tipo_membresia) membresias.add(f.tipo_membresia);
  }
  return {
    eventos: Array.from(eventos).sort((a, b) => a.localeCompare(b)),
    membresias: Array.from(membresias).sort((a, b) => a.localeCompare(b)),
  };
}

export async function obtenerCliente(id: string): Promise<Cliente | null> {
  const { data, error } = await supabase.from("clientes").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? filaACliente(data as ClienteRow) : null;
}

export async function listarEventos(clienteId: string): Promise<EventoTimeline[]> {
  const { data, error } = await supabase
    .from("eventos_timeline")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("fecha", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((e) => ({
    id: e.id,
    clienteId: e.cliente_id,
    tipo: e.tipo,
    detalle: e.detalle,
    autor: e.autor,
    fecha: e.fecha,
  }));
}

// Evento de la timeline con el nombre/correo del cliente ya resuelto (join a
// clientes) — lo usa la página de Actividad para no tener que cruzar listas
// en el cliente. cliente_id nunca queda huérfano (FK not null con cascade),
// así que el join siempre encuentra al cliente, incluso si está archivado
// ("Eliminados" es borrado suave, la fila sigue existiendo).
export type EventoConCliente = EventoTimeline & { clienteNombre: string; clienteEmail: string };

export type FiltrosEventos = {
  busqueda?: string; // texto libre: detalle, autor, nombre/correo del cliente
  tipos?: TipoEvento[];
  clienteId?: string; // acota a un solo cliente (link "ver actividad" desde su perfil)
  desde?: string; // ISO — fecha del evento >=
  hasta?: string; // ISO — fecha del evento <=
  limite?: number;
  pagina?: number;
};

// PostgREST no soporta filtrar columnas de una tabla embebida (clientes.nombre)
// dentro de un or() junto a columnas propias — solo permite un nivel de dot
// (columna.operador.valor). Por eso la búsqueda por nombre/correo de cliente
// se resuelve aparte: primero se buscan los ids de clientes que matcheen, y
// esos ids se agregan como una condición más (cliente_id.in.(...)) al or()
// de eventos_timeline, que sí es una tabla propia.
async function idsClientesPorBusqueda(busqueda: string): Promise<string[]> {
  const q = sanearBusqueda(busqueda.trim());
  if (!q) return [];
  const { data, error } = await supabase
    .from("clientes")
    .select("id")
    .or(`nombre.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((c) => c.id as string);
}

// Arma la condición or() de búsqueda de texto libre una sola vez (no por
// página): detalle/autor propios de eventos_timeline, más los ids de
// clientes cuyo nombre o correo matcheen.
async function condicionBusquedaEventos(busqueda?: string): Promise<string | null> {
  const raw = busqueda?.trim();
  if (!raw) return null;
  const q = sanearBusqueda(raw);
  const idsCliente = await idsClientesPorBusqueda(raw);
  const condiciones = [`detalle.ilike.%${q}%`, `autor.ilike.%${q}%`];
  if (idsCliente.length) condiciones.push(`cliente_id.in.(${idsCliente.join(",")})`);
  return condiciones.join(",");
}

function aplicarFiltrosEventos<
  Q extends {
    or: (s: string) => Q;
    eq: (columna: string, valor: string) => Q;
    in: (columna: string, valores: string[]) => Q;
    gte: (columna: string, valor: string) => Q;
    lte: (columna: string, valor: string) => Q;
  },
>(query: Q, opciones: Omit<FiltrosEventos, "busqueda"> | undefined, condicionBusqueda: string | null): Q {
  if (opciones?.tipos?.length) query = query.in("tipo", opciones.tipos);
  if (opciones?.clienteId) query = query.eq("cliente_id", opciones.clienteId);
  if (opciones?.desde) query = query.gte("fecha", opciones.desde);
  if (opciones?.hasta) query = query.lte("fecha", opciones.hasta);
  if (condicionBusqueda) query = query.or(condicionBusqueda);
  return query;
}

function filaAEventoConCliente(e: {
  id: string;
  cliente_id: string;
  tipo: TipoEvento;
  detalle: string;
  autor: string;
  fecha: string;
  clientes: { nombre: string; email: string } | null;
}): EventoConCliente {
  return {
    id: e.id,
    clienteId: e.cliente_id,
    tipo: e.tipo,
    detalle: e.detalle,
    autor: e.autor,
    fecha: e.fecha,
    clienteNombre: e.clientes?.nombre ?? e.cliente_id,
    clienteEmail: e.clientes?.email ?? e.cliente_id,
  };
}

export async function listarEventosFiltrados(opciones?: FiltrosEventos): Promise<{
  eventos: EventoConCliente[];
  total: number;
}> {
  const limite = opciones?.limite ?? 50;
  const pagina = Math.max(1, opciones?.pagina ?? 1);
  const inicio = (pagina - 1) * limite;

  const condicionBusqueda = await condicionBusquedaEventos(opciones?.busqueda);
  let query = supabase.from("eventos_timeline").select("*, clientes!inner(nombre,email)", { count: "exact" });
  query = aplicarFiltrosEventos(query, opciones, condicionBusqueda);
  query = query.order("fecha", { ascending: false }).range(inicio, inicio + limite - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  return { eventos: (data ?? []).map(filaAEventoConCliente), total: count ?? 0 };
}

const CAP_EXPORTACION_EVENTOS = 50_000;

// Trae TODOS los eventos que matcheen los filtros (sin paginar), para el
// botón "Descargar CSV" de Actividad — mismo patrón que exportarClientes.
export async function exportarEventos(opciones?: FiltrosEventos): Promise<EventoConCliente[]> {
  const condicionBusqueda = await condicionBusquedaEventos(opciones?.busqueda);
  const filas = await traerTodo<Parameters<typeof filaAEventoConCliente>[0]>((from, to) => {
    let query = supabase.from("eventos_timeline").select("*, clientes!inner(nombre,email)");
    query = aplicarFiltrosEventos(query, opciones, condicionBusqueda);
    return query.order("fecha", { ascending: false }).range(from, to);
  });
  if (filas.length > CAP_EXPORTACION_EVENTOS) {
    throw new Error("Demasiados resultados para exportar — aplica filtros para reducir la lista.");
  }
  return filas.map(filaAEventoConCliente);
}

async function regionParaCrearOEditar(evento: string | null, pais: string | null): Promise<string> {
  const mapa = await cargarPaisPorEvento();
  return regionDeCliente(evento, pais, mapa);
}

export async function crearCliente(input: {
  nombre: string;
  email: string;
  telefono?: string | null;
  pais?: string | null;
  ciudad?: string | null;
  notas?: string | null;
  evento?: string | null;
  tipoMembresia?: string | null;
  etiqueta?: string | null;
  autor: string;
}): Promise<Cliente> {
  const id = normalizarEmail(input.email);
  const { data: existente } = await supabase.from("clientes").select("id").eq("id", id).maybeSingle();
  if (existente) throw new Error("Ya existe un cliente con ese correo");

  const evento = input.evento?.trim() || null;
  const region = await regionParaCrearOEditar(evento, input.pais ?? null);

  const { data, error } = await supabase
    .from("clientes")
    .insert({
      id,
      nombre: input.nombre.trim(),
      email: id,
      telefono: normalizarTelefono(input.telefono),
      pais: input.pais?.trim() || null,
      ciudad: input.ciudad?.trim() || null,
      notas: input.notas?.trim() || null,
      // Fecha de alta: siempre el momento real de creación, igual que el
      // resto del CRM (nunca se captura a mano en este formulario).
      fecha_inscripcion: new Date().toISOString(),
      // El alta en Kajabi otorga la oferta ahora mismo (365 días desde hoy),
      // así que el CRM tiene que reflejarlo desde el minuto uno — si se deja
      // vacío, "Pausar/Reanudar" y el cálculo de accesos no tienen de dónde
      // partir.
      fin_acceso: finDeAccesoDentroDeUnAnio(),
      evento,
      tipo_membresia: input.tipoMembresia?.trim() || null,
      etiqueta: input.etiqueta?.trim() || null,
      // Muy por encima de cualquier fila del CSV: los altas manuales
      // siempre encabezan la lista, como corresponde a "lo más reciente".
      orden_csv: Date.now(),
      region,
    })
    .select("*")
    .single();
  if (error) throw error;

  await registrarEvento(id, "CREACION", `Cliente creado por ${input.autor}`, input.autor);
  return filaACliente(data as ClienteRow);
}

// Se llama tras un otorgamiento exitoso de la oferta en Kajabi: refleja en
// el CRM que el acceso sí se dio, de la misma forma en que ya lo hacía el
// CSV de origen ("Sí" en la columna Acceso a plataforma).
export async function marcarAccesoPlataforma(id: string, valor: string): Promise<Cliente> {
  const { data, error } = await supabase
    .from("clientes")
    .update({ acceso_plataforma: valor, actualizado_en: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return filaACliente(data as ClienteRow);
}

// Refleja el resultado del envío del WhatsApp de bienvenida (disparado por
// el Workflow de GHL sobre el tag que le pone altaEnGhl). "Número Inválido"
// nunca lo escribe esta función — es una opción exclusivamente manual desde
// el panel del cliente. Sin `autor` (alta de cliente nuevo) no deja rastro
// en la timeline, porque ya queda cubierto por el evento "CREACION"; con
// `autor` sí registra el cambio — `detalle` deja personalizar ese texto
// (reenvío manual vs. confirmación real del webhook de GHL).
export async function marcarMensajeBienvenidaWa(
  id: string,
  estado: Extract<EstadoMensajeBienvenidaWa, "Enviado" | "Pendiente">,
  autor?: string,
  detalle?: string
): Promise<Cliente> {
  const { data, error } = await supabase
    .from("clientes")
    .update({ contacto_whats: estado, actualizado_en: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  if (autor) {
    await registrarEvento(id, "WA_BIENVENIDA", detalle ?? `Mensaje de Bienvenida WA reenviado — quedó: ${estado}`, autor);
  }
  return filaACliente(data as ClienteRow);
}

// Selección manual desde el desplegable del panel del cliente — a
// diferencia de marcarMensajeBienvenidaWa(), esta sí permite "Número
// Inválido" porque siempre viene de una persona autenticada eligiéndolo a
// propósito, nunca de una automatización.
export async function establecerMensajeBienvenidaWa(
  id: string,
  estado: EstadoMensajeBienvenidaWa,
  autor: string
): Promise<Cliente> {
  const { data: fila, error: errLectura } = await supabase
    .from("clientes")
    .select("contacto_whats")
    .eq("id", id)
    .maybeSingle();
  if (errLectura) throw errLectura;
  if (!fila) throw new Error("Cliente no encontrado");
  const anterior = fila.contacto_whats ?? "—";

  const { data, error } = await supabase
    .from("clientes")
    .update({ contacto_whats: estado, actualizado_en: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;

  if (anterior !== estado) {
    await registrarEvento(id, "WA_BIENVENIDA", `Mensaje de Bienvenida WA: "${anterior}" → "${estado}"`, autor);
  }
  return filaACliente(data as ClienteRow);
}

// Completa el teléfono cuando llegó después del alta (típicamente el
// webhook de Hotmart, que trae el dato que Kajabi no pasa). Solo se usa
// cuando el cliente todavía no tenía teléfono — no pisa uno ya capturado.
export async function actualizarTelefonoCliente(id: string, telefono: string): Promise<Cliente> {
  const { data, error } = await supabase
    .from("clientes")
    .update({ telefono: normalizarTelefono(telefono), actualizado_en: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  await registrarEvento(id, "EDICION_DATOS", "Teléfono completado desde Hotmart", "Hotmart");
  return filaACliente(data as ClienteRow);
}

// Recalcula General/VIP/Black con el motor de reglas (REGLAS-BOLETOS-
// SYNERGY.md) a partir de evento + tipo de membresía + acceso a
// plataforma ya guardados. Se llama tras confirmar el acceso en Kajabi,
// igual que hace `npm run asignar-boletos` en lote para el resto del CSV.
export async function recalcularAccesos(id: string): Promise<Cliente> {
  const { data: fila, error: errLectura } = await supabase.from("clientes").select("*").eq("id", id).maybeSingle();
  if (errLectura) throw errLectura;
  if (!fila) throw new Error("Cliente no encontrado");
  const cliente = filaACliente(fila as ClienteRow);

  const inventario = await cargarInventarioBoletos();
  const { accesos, sinInformacion } = calcularAccesos(
    {
      evento: cliente.evento,
      pais: cliente.pais,
      accesoPlataforma: cliente.accesoPlataforma,
      tipoMembresia: cliente.tipoMembresia,
      fechaInscripcion: cliente.fechaInscripcion,
      finAcceso: cliente.finAcceso,
    },
    inventario
  );

  const { data, error } = await supabase
    .from("clientes")
    .update({ accesos, boletos_sin_informacion: sinInformacion, actualizado_en: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return filaACliente(data as ClienteRow);
}

// Se llama tras un envío exitoso de la invitación a Skool: marca el campo
// (ya existente, traído del CSV de origen) y calcula el vencimiento a
// partir de una fecha ancla + duración de la membresía. `fechaAncla` es la
// fecha de inscripción en el alta normal, o el momento de la renovación
// cuando se llama desde `renovarMembresia`.
export async function marcarInvitacionSkoolEnviada(id: string, fechaAncla?: string): Promise<Cliente> {
  const { data: fila, error: errLectura } = await supabase
    .from("clientes")
    .select("fecha_inscripcion,tipo_membresia")
    .eq("id", id)
    .maybeSingle();
  if (errLectura) throw errLectura;
  if (!fila) throw new Error("Cliente no encontrado");

  const ancla = fechaAncla ?? fila.fecha_inscripcion;
  const vencimiento = ancla ? calcularVencimientoSkool(ancla, fila.tipo_membresia) : null;

  const { data, error } = await supabase
    .from("clientes")
    .update({
      invitacion_skool: "Invitación enviada",
      vencimiento_skool: vencimiento ? formatearFechaSkool(vencimiento) : null,
      vencimiento_skool_fecha: fechaSkoolADateOnly(vencimiento),
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return filaACliente(data as ClienteRow);
}

export function finDeAccesoDentroDeUnAnio(): string {
  const ahora = new Date();
  return new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 365)).toISOString();
}

// Renovación de membresía (botón "Renovar" en el perfil, solo visible si en
// Kajabi la oferta ya no está activa). Section 4 de REGLAS-BOLETOS-
// SYNERGY.md: el motor de accesos usa "Renov" en Acceso a plataforma —no la
// etiqueta— para aplicar la regla fija por país (2 Generales MX, etc.) en
// vez de la tabla de inventario por evento.
export async function renovarMembresia(id: string, autor: string): Promise<Cliente> {
  const finAcceso = finDeAccesoDentroDeUnAnio();
  const { data, error } = await supabase
    .from("clientes")
    .update({
      etiqueta: "Renovacion",
      tipo_membresia: "12 Meses",
      acceso_plataforma: "Renovación",
      fin_acceso: finAcceso,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;

  await registrarEvento(id, "RENOVACION", `Membresía renovada — Fin de acceso: ${formatearFechaSkool(new Date(finAcceso))}`, autor);
  return filaACliente(data as ClienteRow);
}

// Días completos entre dos fechas ISO, usando componentes de fecha (no
// horas/minutos) para no arrastrar diferencias de horario — mismo criterio
// que finDeAccesoDentroDeUnAnio.
function diasEntreFechas(desdeIso: string, hastaIso: string): number {
  const a = new Date(desdeIso);
  const b = new Date(hastaIso);
  const inicioA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const inicioB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((inicioB - inicioA) / 86400000);
}

// Pausa de membresía (botón "Pausar" en el perfil): solo marca la pausa y
// congela cuántos días le quedaban — revocar la oferta en Kajabi lo hace la
// ruta de la API por separado, este función es la parte pura del CRM.
export async function pausarMembresia(id: string, autor: string): Promise<Cliente> {
  const { data: fila, error: errLectura } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (errLectura) throw errLectura;
  if (!fila) throw new Error("Cliente no encontrado");
  const cliente = filaACliente(fila as ClienteRow);
  if (cliente.pausadoEn) throw new Error("Este cliente ya está pausado");

  const ahora = new Date().toISOString();
  const { data, error } = await supabase
    .from("clientes")
    .update({ pausado_en: ahora, fin_acceso_al_pausar: cliente.finAcceso, actualizado_en: ahora })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;

  await registrarEvento(id, "PAUSA", `Membresía pausada por ${autor}`, autor);
  return filaACliente(data as ClienteRow);
}

export type ResultadoReanudar = { cliente: Cliente; fechaCalculada: string; diasRestantes: number };

// Reanuda una membresía pausada: calcula cuántos días le quedaban cuando se
// pausó (fin_acceso_al_pausar − pausado_en) y se los suma a partir de hoy —
// no le regala un año completo de nuevo. El re-otorgamiento en Kajabi (que
// sí arranca su propio contador de 365 días, no editable por API) lo hace
// la ruta de la API; por eso el aviso al usuario para que lo corrija a mano.
export async function reanudarMembresia(id: string, autor: string): Promise<ResultadoReanudar> {
  const { data: fila, error: errLectura } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (errLectura) throw errLectura;
  if (!fila) throw new Error("Cliente no encontrado");
  const cliente = filaACliente(fila as ClienteRow);
  if (!cliente.pausadoEn) throw new Error("Este cliente no está pausado");

  // Respaldo por si finAccesoAlPausar quedó vacío (clientes creados antes de
  // que el alta empezara a guardar fin_acceso): se recalcula desde fecha de
  // inscripción + 365 días en vez de asumir 0 días restantes, que sería
  // castigar al cliente por un hueco de datos que no es su culpa.
  const finAlPausar =
    cliente.finAccesoAlPausar ??
    (cliente.fechaInscripcion
      ? new Date(new Date(cliente.fechaInscripcion).getTime() + 365 * 86400000).toISOString()
      : cliente.pausadoEn);
  const diasRestantes = Math.max(0, diasEntreFechas(cliente.pausadoEn, finAlPausar));

  const ahora = new Date();
  const fechaCalculada = new Date(
    Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() + diasRestantes)
  ).toISOString();

  const { data, error } = await supabase
    .from("clientes")
    .update({
      pausado_en: null,
      fin_acceso_al_pausar: null,
      fin_acceso: fechaCalculada,
      actualizado_en: ahora.toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;

  await registrarEvento(
    id,
    "REANUDACION",
    `Membresía reanudada por ${autor} — ${diasRestantes} días restantes, fin de acceso recalculado a ${formatearFechaSkool(new Date(fechaCalculada))}`,
    autor
  );

  return { cliente: filaACliente(data as ClienteRow), fechaCalculada, diasRestantes };
}

const CAMPOS_EDITABLES: { key: keyof CambiosDatosCliente; columna: string; label: string }[] = [
  { key: "nombre", columna: "nombre", label: "Nombre" },
  { key: "telefono", columna: "telefono", label: "Teléfono" },
  { key: "pais", columna: "pais", label: "País" },
  { key: "ciudad", columna: "ciudad", label: "Ciudad" },
  { key: "notas", columna: "notas", label: "Notas" },
  { key: "evento", columna: "evento", label: "Evento" },
  { key: "accesoPlataforma", columna: "acceso_plataforma", label: "Acceso a plataforma" },
  { key: "tipoMembresia", columna: "tipo_membresia", label: "Tipo de membresía" },
  { key: "vencimientoSkool", columna: "vencimiento_skool", label: "Vencimiento Skool" },
  { key: "invitacionSkool", columna: "invitacion_skool", label: "Invitación de Skool" },
  { key: "llamada", columna: "llamada", label: "Llamada" },
  { key: "notasSoporte", columna: "notas_soporte", label: "Notas de soporte técnico" },
];

type CambiosDatosCliente = {
  nombre: string;
  telefono?: string | null;
  pais?: string | null;
  ciudad?: string | null;
  notas?: string | null;
  evento?: string | null;
  accesoPlataforma?: string | null;
  tipoMembresia?: string | null;
  vencimientoSkool?: string | null;
  invitacionSkool?: string | null;
  llamada?: string | null;
  notasSoporte?: string | null;
  // "YYYY-MM-DD" (input type=date) o null/vacío para limpiarla.
  finAcceso?: string | null;
};

export async function actualizarDatosCliente(
  id: string,
  cambios: CambiosDatosCliente,
  autor: string
): Promise<Cliente> {
  const { data: filaAnterior, error: errLectura } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (errLectura) throw errLectura;
  if (!filaAnterior) throw new Error("Cliente no encontrado");
  const anterior = filaACliente(filaAnterior as ClienteRow);

  const nuevos: Record<string, string> = {
    nombre: cambios.nombre.trim(),
    telefono: normalizarTelefono(cambios.telefono) ?? "—",
    pais: cambios.pais?.trim() || "—",
    ciudad: cambios.ciudad?.trim() || "—",
    notas: cambios.notas?.trim() || "—",
    evento: cambios.evento?.trim() || "—",
    accesoPlataforma: cambios.accesoPlataforma?.trim() || "—",
    tipoMembresia: cambios.tipoMembresia?.trim() || "—",
    vencimientoSkool: cambios.vencimientoSkool?.trim() || "—",
    invitacionSkool: cambios.invitacionSkool?.trim() || "—",
    llamada: cambios.llamada?.trim() || "—",
    notasSoporte: cambios.notasSoporte?.trim() || "—",
  };

  const detalleTextos = CAMPOS_EDITABLES.map(({ key, label }) => ({
    label,
    anterior: (anterior[key as keyof Cliente] as string | null) ?? "—",
    nuevo: nuevos[key],
  }))
    .filter((c) => c.anterior !== c.nuevo)
    .map((c) => `${c.label}: "${c.anterior}" → "${c.nuevo}"`);

  const nuevoEvento = cambios.evento?.trim() || null;
  const nuevoPais = cambios.pais?.trim() || null;
  const region = await regionParaCrearOEditar(nuevoEvento, nuevoPais);

  // Si cambia el tipo de membresía, el vencimiento de Skool se recalcula
  // desde la fecha de inscripción — ignora lo que se haya escrito a mano en
  // ese mismo guardado, para no dejar una fecha inconsistente con la nueva
  // duración.
  const nuevaMembresia = cambios.tipoMembresia?.trim() || null;
  const membresiaCambio = nuevaMembresia !== anterior.tipoMembresia;

  let vencimientoSkoolTexto = cambios.vencimientoSkool?.trim() || null;
  let vencimientoSkoolFecha = fechaSkoolADateOnly(parsearFechaSkool(vencimientoSkoolTexto));
  if (membresiaCambio && anterior.fechaInscripcion) {
    const recalculado = calcularVencimientoSkool(anterior.fechaInscripcion, nuevaMembresia);
    vencimientoSkoolTexto = recalculado ? formatearFechaSkool(recalculado) : null;
    vencimientoSkoolFecha = fechaSkoolADateOnly(recalculado);
  }

  const finAccesoNuevo = cambios.finAcceso?.trim() ? new Date(cambios.finAcceso.trim()).toISOString() : null;
  const finAccesoCambio = finAccesoNuevo !== anterior.finAcceso;

  const detalle = [
    ...detalleTextos,
    membresiaCambio
      ? `Vencimiento Skool recalculado: "${anterior.vencimientoSkool ?? "—"}" → "${vencimientoSkoolTexto ?? "—"}"`
      : null,
    finAccesoCambio
      ? `Fin de acceso: "${anterior.finAcceso ? formatearFechaSkool(new Date(anterior.finAcceso)) : "—"}" → "${finAccesoNuevo ? formatearFechaSkool(new Date(finAccesoNuevo)) : "—"}"`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const { data, error } = await supabase
    .from("clientes")
    .update({
      nombre: cambios.nombre.trim(),
      telefono: normalizarTelefono(cambios.telefono),
      pais: nuevoPais,
      ciudad: cambios.ciudad?.trim() || null,
      notas: cambios.notas?.trim() || null,
      evento: nuevoEvento,
      acceso_plataforma: cambios.accesoPlataforma?.trim() || null,
      tipo_membresia: nuevaMembresia,
      vencimiento_skool: vencimientoSkoolTexto,
      vencimiento_skool_fecha: vencimientoSkoolFecha,
      invitacion_skool: cambios.invitacionSkool?.trim() || null,
      llamada: cambios.llamada?.trim() || null,
      notas_soporte: cambios.notasSoporte?.trim() || null,
      fin_acceso: finAccesoNuevo,
      region,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;

  if (detalle) {
    await registrarEvento(id, "EDICION_DATOS", detalle, autor);
  }

  let clienteFinal = filaACliente(data as ClienteRow);
  if (membresiaCambio) {
    clienteFinal = await recalcularAccesos(id);
  }
  return clienteFinal;
}

const ACCESO_LABEL: Record<keyof Accesos, string> = {
  general: "General",
  vip: "VIP",
  black: "Black Access",
};

function textoAcceso(d: { activo: boolean; cantidad: number; variante: Variante }): string {
  return d.activo && d.cantidad > 0 ? `${d.cantidad}${d.variante ? ` · ${d.variante}` : ""}` : "Sin acceso";
}

// Guarda los 3 niveles de acceso (General/VIP/Black) en una sola escritura —
// reemplaza el objeto completo en vez de tocar un nivel a la vez, para que
// "quitarle 2 General y darle 2 VIP" sea una sola operación atómica, no dos
// PATCH separados que podrían dejar al cliente en un estado intermedio si
// uno falla. Registra un solo evento "EDICION" listando qué niveles
// cambiaron (igual que actualizarDatosCliente con los demás campos).
export async function actualizarAccesos(id: string, nuevosAccesos: Accesos, autor: string): Promise<Cliente> {
  const { data: fila, error: errLectura } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (errLectura) throw errLectura;
  if (!fila) throw new Error("Cliente no encontrado");
  const anterior = filaACliente(fila as ClienteRow).accesos;

  const normalizado = (Object.keys(nuevosAccesos) as (keyof Accesos)[]).reduce((acc, nivel) => {
    const cantidad = Math.max(0, Math.floor(nuevosAccesos[nivel].cantidad || 0));
    acc[nivel] = {
      activo: cantidad > 0,
      cantidad,
      variante: cantidad > 0 && nivel !== "black" ? nuevosAccesos[nivel].variante : null,
    };
    return acc;
  }, {} as Accesos);

  const cambios = (Object.keys(normalizado) as (keyof Accesos)[])
    .filter((nivel) => JSON.stringify(anterior[nivel]) !== JSON.stringify(normalizado[nivel]))
    .map((nivel) => `${ACCESO_LABEL[nivel]}: ${textoAcceso(anterior[nivel])} → ${textoAcceso(normalizado[nivel])}`);

  const { data, error } = await supabase
    .from("clientes")
    .update({ accesos: normalizado, actualizado_en: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;

  if (cambios.length) {
    await registrarEvento(id, "EDICION_ACCESOS", `Accesos — ${cambios.join(" · ")}`, autor);
  }
  return filaACliente(data as ClienteRow);
}

export async function actualizarTags(id: string, tags: string[], autor: string): Promise<Cliente> {
  const { data: fila, error: errLectura } = await supabase
    .from("clientes")
    .select("tags")
    .eq("id", id)
    .maybeSingle();
  if (errLectura) throw errLectura;
  if (!fila) throw new Error("Cliente no encontrado");
  const anteriores: string[] = fila.tags ?? [];

  const { data, error } = await supabase
    .from("clientes")
    .update({ tags, actualizado_en: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;

  const agregados = tags.filter((t) => !anteriores.includes(t));
  const quitados = anteriores.filter((t) => !tags.includes(t));
  const detalle = [agregados.length ? `+ ${agregados.join(", ")}` : null, quitados.length ? `− ${quitados.join(", ")}` : null]
    .filter(Boolean)
    .join(" · ");
  if (detalle) await registrarEvento(id, "EDICION_TAGS", `Tags: ${detalle}`, autor);

  return filaACliente(data as ClienteRow);
}

export async function agregarNota(id: string, nota: string, autor: string): Promise<void> {
  const { data, error } = await supabase.from("clientes").select("id").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Cliente no encontrado");
  await registrarEvento(id, "NOTA", nota.trim(), autor);
}

export async function vincularKajabiContactId(id: string, kajabiContactId: string): Promise<void> {
  const { error } = await supabase.from("clientes").update({ kajabi_contact_id: kajabiContactId }).eq("id", id);
  if (error) throw error;
}

export type ResultadoRegistrarTagKajabi = { cliente: Cliente; esNuevo: boolean };

// Registra en la timeline que a un cliente se le asignó un tag de Kajabi.
// Dos caminos llegan aquí para el mismo hecho real (el alta del CRM, que
// sabe que otorgar la oferta dispara el tag; y el aviso de Kajabi/Zapier,
// para altas que pasan por fuera del CRM) — por eso es idempotente: si ya
// hay un evento de este mismo tag para este cliente, no lo duplica. Si el
// correo no existe todavía en el CRM (alta directo en Kajabi, típicamente
// una compra por Hotmart que Kajabi detecta solo) se crea el cliente
// primero, tomando el teléfono en espera de Hotmart si ya llegó (ver
// hotmart_pendientes) — devuelve si el cliente es nuevo para que quien
// llama decida si hace falta invitar a Skool / mandar WhatsApp.
export async function registrarTagKajabi(
  email: string,
  nombre: string,
  tagNombre: string
): Promise<ResultadoRegistrarTagKajabi> {
  const id = normalizarEmail(email);
  const { data: existente, error: errLectura } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (errLectura) throw errLectura;

  let cliente: Cliente;
  let esNuevo = false;

  if (existente) {
    cliente = filaACliente(existente as ClienteRow);
  } else {
    esNuevo = true;
    const region = await regionParaCrearOEditar(null, null);
    // Prioridad del teléfono: primero lo que haya dejado en espera el
    // webhook de Hotmart (dato real de compra, más reciente), y si no,
    // el que ya tenga capturado en su perfil de Kajabi — así este alta
    // automática arranca con teléfono igual que una manual, sin esperar a
    // que alguien lo escriba a mano.
    const telefonoPendiente = await tomarTelefonoPendienteHotmart(id);
    const telefonoCrudo = telefonoPendiente ?? (await obtenerPerfilKajabi(id).catch(() => null))?.telefono ?? null;
    // Mismo formato E.164 ("+...") que actualizarTelefonoCliente usa cuando
    // el cliente ya existe — sin esto, un alta automática (ésta) quedaba con
    // un teléfono sin "+" y el link tel: del panel del cliente salía roto.
    const telefono = normalizarTelefono(telefonoCrudo);
    const { data, error } = await supabase
      .from("clientes")
      .insert({
        id,
        nombre: nombre?.trim() || id,
        email: id,
        telefono,
        fecha_inscripcion: new Date().toISOString(),
        fin_acceso: finDeAccesoDentroDeUnAnio(),
        orden_csv: Date.now(),
        region,
        // Llegar aquí (alta automática vía tag de Kajabi) significa que
        // Kajabi ya confirmó el acceso — el indicador de la lista debe
        // reflejarlo desde el minuto uno, no quedarse en "sin acceso" solo
        // porque el alta no pasó por el formulario del CRM.
        acceso_plataforma: "Si",
      })
      .select("*")
      .single();
    if (error) throw error;
    cliente = filaACliente(data as ClienteRow);
    await registrarEvento(id, "CREACION", "Cliente creado automáticamente desde Kajabi", "Kajabi");
  }

  const detalle = `Tag de Kajabi asignado: "${tagNombre}"`;
  const { data: yaRegistrado, error: errDup } = await supabase
    .from("eventos_timeline")
    .select("id")
    .eq("cliente_id", id)
    .eq("tipo", "KAJABI")
    .eq("detalle", detalle)
    .maybeSingle();
  if (errDup) throw errDup;
  if (!yaRegistrado) {
    await registrarEvento(id, "KAJABI", detalle, "Kajabi");
  }

  return { cliente, esNuevo };
}

// --- Teléfonos de Hotmart en espera (ver hotmart_pendientes en schema.sql) ---

export async function guardarTelefonoPendienteHotmart(
  email: string,
  telefono: string,
  producto: string | null
): Promise<void> {
  const { error } = await supabase
    .from("hotmart_pendientes")
    .upsert({ email: normalizarEmail(email), telefono, producto, recibido_en: new Date().toISOString() });
  if (error) throw error;
}

// Lee el teléfono en espera para este correo y lo borra en el mismo paso
// (una sola vez) — si no hay nada pendiente, null.
async function tomarTelefonoPendienteHotmart(email: string): Promise<string | null> {
  const id = normalizarEmail(email);
  const { data, error } = await supabase
    .from("hotmart_pendientes")
    .select("telefono")
    .eq("email", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  await supabase.from("hotmart_pendientes").delete().eq("email", id);
  return data.telefono;
}

const CURSOR_SYNC_KAJABI = "ultimo_customer_creado_en";

export async function obtenerCursorSyncKajabi(): Promise<string | null> {
  const { data, error } = await supabase
    .from("kajabi_sync_estado")
    .select("valor")
    .eq("clave", CURSOR_SYNC_KAJABI)
    .maybeSingle();
  if (error) throw error;
  return data?.valor ?? null;
}

export async function guardarCursorSyncKajabi(valor: string): Promise<void> {
  const { error } = await supabase
    .from("kajabi_sync_estado")
    .upsert({ clave: CURSOR_SYNC_KAJABI, valor, actualizado_en: new Date().toISOString() });
  if (error) throw error;
}

// Archiva el cliente (no lo borra): sale de la lista principal pero
// conserva su fila y su timeline completa, incluido este mismo evento, por
// si hay que auditar quién lo eliminó y cuándo. El borrado real en Kajabi
// se maneja aparte, en la ruta de la API.
export async function eliminarCliente(id: string, autor: string): Promise<Cliente> {
  const { data, error } = await supabase
    .from("clientes")
    .update({ eliminado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;

  await registrarEvento(id, "ELIMINADO", `Cliente eliminado por ${autor}`, autor);
  return filaACliente(data as ClienteRow);
}

export async function listarEliminados(busqueda?: string): Promise<Cliente[]> {
  let query = supabase.from("clientes").select("*").not("eliminado_en", "is", null);
  const q = sanearBusqueda(busqueda?.trim() ?? "");
  if (q) query = query.or(`nombre.ilike.%${q}%,email.ilike.%${q}%`);
  query = query.order("eliminado_en", { ascending: false }).limit(500);

  const { data, error } = await query;
  if (error) throw error;
  return (data as ClienteRow[]).map(filaACliente);
}

// --- "Otras Ofertas": roster independiente de Clientes (Club Sinergético).
// Ver el comentario junto a la tabla en supabase/schema.sql sobre por qué es
// una tabla aparte en vez de reusar `clientes`. ---

type OtraOfertaClienteRow = {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  tags: string[];
  etiqueta: string | null;
  orden_csv: number;
  kajabi_contact_id: string | null;
  creado_en: string;
  actualizado_en: string;
};

function filaAOtraOfertaCliente(r: OtraOfertaClienteRow): OtraOfertaCliente {
  return {
    id: r.id,
    nombre: r.nombre,
    email: r.email,
    telefono: r.telefono,
    tags: r.tags ?? [],
    etiqueta: r.etiqueta,
    ordenCsv: r.orden_csv,
    kajabiContactId: r.kajabi_contact_id,
    creadoEn: r.creado_en,
    actualizadoEn: r.actualizado_en,
    ultimaOferta: null,
  };
}

type OfertaOtorgadaRow = {
  id: string;
  cliente_id: string;
  oferta_id: string;
  oferta_titulo: string;
  fecha_otorgada: string;
  fin_acceso: string;
  otorgado_por: string;
  revocado_en: string | null;
  revocado_por: string | null;
};

function filaAOfertaOtorgada(r: OfertaOtorgadaRow): OfertaOtorgada {
  return {
    id: r.id,
    clienteId: r.cliente_id,
    ofertaId: r.oferta_id,
    ofertaTitulo: r.oferta_titulo,
    fechaOtorgada: r.fecha_otorgada,
    finAcceso: r.fin_acceso,
    otorgadoPor: r.otorgado_por,
    revocadoEn: r.revocado_en,
    revocadoPor: r.revocado_por,
  };
}

export type FiltrosOtrasOfertas = {
  busqueda?: string;
  etiqueta?: string;
  tag?: string;
  limite?: number;
  pagina?: number;
};

export async function listarOtrasOfertasClientes(opciones?: FiltrosOtrasOfertas): Promise<{
  clientes: OtraOfertaCliente[];
  total: number;
}> {
  const limite = opciones?.limite ?? 100;
  const pagina = Math.max(1, opciones?.pagina ?? 1);
  const inicio = (pagina - 1) * limite;

  let query = supabase.from("otras_ofertas_clientes").select("*", { count: "exact" });
  const q = sanearBusqueda(opciones?.busqueda?.trim() ?? "");
  if (q) query = query.or(`nombre.ilike.%${q}%,email.ilike.%${q}%`);
  if (opciones?.etiqueta) query = query.eq("etiqueta", opciones.etiqueta);
  if (opciones?.tag) query = query.contains("tags", [opciones.tag]);
  query = query.order("orden_csv", { ascending: false }).range(inicio, inicio + limite - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  const clientes = (data as OtraOfertaClienteRow[]).map(filaAOtraOfertaCliente);

  // La oferta más reciente de cada uno, para la columna de la lista — una
  // sola consulta por página (no una por fila) a la tabla de historial.
  if (clientes.length > 0) {
    const ids = clientes.map((c) => c.id);
    const { data: grantsData, error: errorGrants } = await supabase
      .from("otras_ofertas_otorgadas")
      .select("cliente_id, oferta_titulo")
      .in("cliente_id", ids)
      .order("fecha_otorgada", { ascending: false });
    if (errorGrants) throw errorGrants;
    const ultimaPorCliente = new Map<string, string>();
    for (const g of (grantsData ?? []) as { cliente_id: string; oferta_titulo: string }[]) {
      if (!ultimaPorCliente.has(g.cliente_id)) ultimaPorCliente.set(g.cliente_id, g.oferta_titulo);
    }
    for (const c of clientes) c.ultimaOferta = ultimaPorCliente.get(c.id) ?? null;
  }

  return { clientes, total: count ?? 0 };
}

const CAP_EXPORTACION_OTRAS_OFERTAS = 50_000;

// Mismo criterio que exportarClientes: trae todo lo que matchee sin paginar,
// para el botón "Descargar CSV".
export async function exportarOtrasOfertasClientes(opciones?: FiltrosOtrasOfertas): Promise<OtraOfertaCliente[]> {
  const filas = await traerTodo<OtraOfertaClienteRow>((from, to) => {
    let query = supabase.from("otras_ofertas_clientes").select("*");
    const q = sanearBusqueda(opciones?.busqueda?.trim() ?? "");
    if (q) query = query.or(`nombre.ilike.%${q}%,email.ilike.%${q}%`);
    if (opciones?.etiqueta) query = query.eq("etiqueta", opciones.etiqueta);
    if (opciones?.tag) query = query.contains("tags", [opciones.tag]);
    return query.order("orden_csv", { ascending: false }).range(from, to);
  });
  if (filas.length > CAP_EXPORTACION_OTRAS_OFERTAS) {
    throw new Error("Demasiados resultados para exportar — aplica filtros para reducir la lista.");
  }
  return filas.map(filaAOtraOfertaCliente);
}

export async function obtenerOtraOfertaCliente(id: string): Promise<OtraOfertaCliente | null> {
  const { data, error } = await supabase.from("otras_ofertas_clientes").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? filaAOtraOfertaCliente(data as OtraOfertaClienteRow) : null;
}

export async function listarOfertasOtorgadas(clienteId: string): Promise<OfertaOtorgada[]> {
  const { data, error } = await supabase
    .from("otras_ofertas_otorgadas")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("fecha_otorgada", { ascending: false });
  if (error) throw error;
  return (data as OfertaOtorgadaRow[]).map(filaAOfertaOtorgada);
}

// Encuentra o crea la identidad del roster de Otras Ofertas por correo — a
// diferencia de crearCliente, NUNCA tira error si ya existe: la misma
// persona puede reimportarse más adelante con una oferta distinta (cada
// oferta otorgada se registra aparte, ver registrarOfertaOtorgada). Tags se
// unen (nunca se pierde uno ya asignado); etiqueta y teléfono solo se pisan
// si el nuevo import trae un valor — si no, se conserva el que ya había.
export async function upsertOtraOfertaClienteIdentidad(input: {
  nombre: string;
  email: string;
  telefono?: string | null;
  tags?: string[];
  etiqueta?: string | null;
}): Promise<OtraOfertaCliente> {
  const id = normalizarEmail(input.email);
  const { data: existenteRaw } = await supabase.from("otras_ofertas_clientes").select("*").eq("id", id).maybeSingle();
  const existente = existenteRaw as OtraOfertaClienteRow | null;

  const tagsNuevos = input.tags ?? [];
  const tagsFinales = existente ? Array.from(new Set([...(existente.tags ?? []), ...tagsNuevos])) : tagsNuevos;

  const { data, error } = await supabase
    .from("otras_ofertas_clientes")
    .upsert(
      {
        id,
        nombre: input.nombre.trim(),
        email: id,
        telefono: normalizarTelefono(input.telefono) ?? existente?.telefono ?? null,
        tags: tagsFinales,
        etiqueta: input.etiqueta?.trim() || existente?.etiqueta || null,
        orden_csv: Date.now(),
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return filaAOtraOfertaCliente(data as OtraOfertaClienteRow);
}

export async function registrarOfertaOtorgada(
  clienteId: string,
  ofertaId: string,
  ofertaTitulo: string,
  autor: string
): Promise<OfertaOtorgada> {
  const { data, error } = await supabase
    .from("otras_ofertas_otorgadas")
    .insert({
      cliente_id: clienteId,
      oferta_id: ofertaId,
      oferta_titulo: ofertaTitulo,
      fin_acceso: finDeAccesoDentroDeUnAnio(),
      otorgado_por: autor,
    })
    .select("*")
    .single();
  if (error) throw error;
  return filaAOfertaOtorgada(data as OfertaOtorgadaRow);
}

export async function revocarOfertaOtorgada(grantId: string, autor: string): Promise<OfertaOtorgada> {
  const { data, error } = await supabase
    .from("otras_ofertas_otorgadas")
    .update({ revocado_en: new Date().toISOString(), revocado_por: autor })
    .eq("id", grantId)
    .select("*")
    .single();
  if (error) throw error;
  return filaAOfertaOtorgada(data as OfertaOtorgadaRow);
}

export async function vincularKajabiContactIdOtraOferta(id: string, kajabiContactId: string): Promise<void> {
  const { error } = await supabase.from("otras_ofertas_clientes").update({ kajabi_contact_id: kajabiContactId }).eq("id", id);
  if (error) throw error;
}

// --- Ofertas EXTRA (no la del Club) para un cliente del Club Sinergético ya
// existente — se otorgan desde su panel o su alta, y se guardan aparte del
// roster de Otras Ofertas (FK a `clientes`, no a `otras_ofertas_clientes`). ---

export async function listarOfertasClienteClub(clienteId: string): Promise<OfertaOtorgada[]> {
  const { data, error } = await supabase
    .from("clientes_ofertas")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("fecha_otorgada", { ascending: false });
  if (error) throw error;
  return (data as OfertaOtorgadaRow[]).map(filaAOfertaOtorgada);
}

export async function registrarOfertaClienteClub(
  clienteId: string,
  ofertaId: string,
  ofertaTitulo: string,
  autor: string
): Promise<OfertaOtorgada> {
  const { data, error } = await supabase
    .from("clientes_ofertas")
    .insert({
      cliente_id: clienteId,
      oferta_id: ofertaId,
      oferta_titulo: ofertaTitulo,
      fin_acceso: finDeAccesoDentroDeUnAnio(),
      otorgado_por: autor,
    })
    .select("*")
    .single();
  if (error) throw error;

  await registrarEvento(clienteId, "OFERTA_OTORGADA", `Oferta adicional otorgada: "${ofertaTitulo}"`, autor);
  return filaAOfertaOtorgada(data as OfertaOtorgadaRow);
}

export async function revocarOfertaClienteClub(grantId: string, autor: string): Promise<OfertaOtorgada> {
  const { data, error } = await supabase
    .from("clientes_ofertas")
    .update({ revocado_en: new Date().toISOString(), revocado_por: autor })
    .eq("id", grantId)
    .select("*")
    .single();
  if (error) throw error;

  const oferta = filaAOfertaOtorgada(data as OfertaOtorgadaRow);
  await registrarEvento(oferta.clienteId, "OFERTA_REVOCADA", `Oferta adicional revocada: "${oferta.ofertaTitulo}"`, autor);
  return oferta;
}
