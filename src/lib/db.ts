import { supabase } from "./supabase";
import {
  anclaAlRenovar,
  calcularVencimientoSkool,
  fechaRenovacionDesdeFinDeseado,
  finAccesoCalculado,
  finAccesoConEtiqueta,
  formatearFechaSkool,
  parsearFechaSkool,
} from "./fechas";
import { cargarInventarioBoletos, cargarPaisPorEvento, cargarTipoPorEvento, calcularAccesos, regionDeCliente } from "./boletos";
import { detectarEventoEnAxis, detectarMembresiaEnComprasAxis, obtenerHistorialAxis } from "./axis";
import { detectarProductoClubSinergetico, mayorMembresia } from "./hotmart";
import { actualizarCorreoContacto, estadoOfertaContacto, KAJABI_OFFER_ID_CLUB_SINERGETICO, obtenerPerfilKajabi } from "./kajabi";
import { invitarASkool } from "./skool";
import { filaACliente, fechaSkoolADateOnly, normalizarAccesos, type ClienteRow } from "./supabase-map";
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
    accesos: normalizarAccesos(r.accesos),
  }));
}

export type EstadoFiltro = "todos" | "activos" | "revocados";
export type RegionFiltro = "todos" | "MX" | "US" | "LATAM";
export type VigenciaFiltro = "actuales" | "futuros" | "todos";
export type TipoEventoFiltro = "todos" | "webinar" | "presencial";
// "Sin Kajabi" no aplica: crearCliente() bloquea el alta si Kajabi falla
// (ver alta-cliente.ts), así que ningún cliente real puede quedar sin
// Kajabi — no tiene caso ofrecer ese filtro.
export type ProcesoFiltro = "todos" | "sin_skool" | "sin_bienvenida";

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
  proceso?: ProcesoFiltro;
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

// Busca cada palabra por separado en vez de la frase completa como un solo
// substring contiguo — "Juan Pérez" antes no encontraba a "Juan Carlos
// Pérez" porque esas dos palabras no quedan juntas y seguidas en el campo.
// Devuelve una cláusula .or() por palabra; aplicarlas todas con
// query.or(clausula) en un for encadena varios .or() seguidos, que en
// supabase-js/PostgREST se combinan con AND entre sí — así que exige que
// TODAS las palabras aparezcan, en cualquier orden, en cualquiera de las
// columnas dadas. (No se hace genérica sobre el tipo del query builder de
// Supabase a propósito: eso dispara "Type instantiation is excessively
// deep" — cada call site aplica las cláusulas en su propio for.)
function clausulasBusquedaMultiPalabra(busqueda: string | undefined, columnas: string[]): string[] {
  const q = sanearBusqueda(busqueda?.trim() ?? "");
  if (!q) return [];
  const palabras = q.split(/\s+/).filter(Boolean);
  return palabras.map((palabra) => columnas.map((c) => `${c}.ilike.%${palabra}%`).join(","));
}

// El CSV de origen mezcla "3 Meses"/"3 MESES"/etc. — mismo dato, distinta
// mayúscula/minúscula. Se normaliza a un solo formato ("3 Meses") para que
// el filtro solo ofrezca 3 opciones en vez de 6, y para el ".ilike" que las
// aplica (ver aplicarFiltrosClientes) — ilike ya ignora mayúsculas, este
// normalizador es solo para no duplicar la opción en la lista del filtro.
function normalizarTipoMembresia(valor: string): string {
  const m = valor.trim().match(/^(\d+)\s*meses?$/i);
  return m ? `${m[1]} Meses` : valor.trim();
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

  for (const clausula of clausulasBusquedaMultiPalabra(opciones?.busqueda, ["nombre", "email", "telefono"])) query = query.or(clausula);

  if (opciones?.estado === "activos") query = query.ilike("acceso_plataforma", "si");
  if (opciones?.estado === "revocados") query = query.ilike("acceso_plataforma", "revocado");

  if (opciones?.region && opciones.region !== "todos") query = query.eq("region", opciones.region);

  if (opciones?.eventos?.length) query = query.in("evento", opciones.eventos);
  // .ilike (no .in) porque las opciones vienen normalizadas ("3 Meses") pero
  // el dato guardado puede estar en cualquier mayúscula/minúscula ("3 MESES")
  // — ilike sin comodines es una igualdad exacta que ignora mayúsculas.
  if (opciones?.membresias?.length) {
    query = query.or(opciones.membresias.map((m) => `tipo_membresia.ilike.${m}`).join(","));
  }

  if (opciones?.desde) query = query.gte("fecha_inscripcion", opciones.desde);
  if (opciones?.hasta) query = query.lte("fecha_inscripcion", opciones.hasta);

  if (opciones?.vencidosAntesDe) query = query.lt("vencimiento_skool_fecha", opciones.vencidosAntesDe);

  // Mismo criterio de "enviado" que EstadoOnboarding (clientes/page.tsx):
  // Skool cuenta como enviado con "Invitación enviada" o "Invitacion
  // enviada" (sin acento, texto tal cual de la hoja importada); Bienvenida
  // WA con "Enviado" o "MSJS Bienvenida" (igual, texto de la hoja vieja).
  // "Sin X" es null O cualquier otro valor que no sea esos.
  if (opciones?.proceso === "sin_skool") {
    query = query.or(
      "invitacion_skool.is.null,and(invitacion_skool.not.ilike.Invitación enviada,invitacion_skool.not.ilike.Invitacion enviada)"
    );
  }
  if (opciones?.proceso === "sin_bienvenida") {
    query = query.or("contacto_whats.is.null,and(contacto_whats.neq.Enviado,contacto_whats.neq.MSJS Bienvenida)");
  }

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
    if (f.tipo_membresia) membresias.add(normalizarTipoMembresia(f.tipo_membresia));
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
  if (!sanearBusqueda(busqueda.trim())) return [];
  let query = supabase.from("clientes").select("id");
  for (const clausula of clausulasBusquedaMultiPalabra(busqueda, ["nombre", "email"])) query = query.or(clausula);
  const { data, error } = await query.limit(500);
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
  const etiqueta = input.etiqueta?.trim() || null;
  const region = await regionParaCrearOEditar(evento, input.pais ?? null);
  const ahora = new Date().toISOString();

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
      // "Fin de acceso" no se guarda — se calcula siempre desde esta fecha
      // (+1 año, sin fecha_renovacion todavía) con finAccesoCalculado().
      fecha_inscripcion: ahora,
      evento,
      tipo_membresia: input.tipoMembresia?.trim() || null,
      etiqueta,
      // Ver finAccesoConEtiqueta() (fechas.ts): un alta nueva con etiqueta
      // ya cuenta como "asignada de aquí en adelante", así que el ajuste de
      // Fin de acceso (MÁS+/Black Access) sí le aplica desde el día uno.
      etiqueta_asignada_en: etiqueta ? ahora : null,
      // Muy por encima de cualquier fila del CSV: los altas manuales
      // siempre encabezan la lista, como corresponde a "lo más reciente".
      orden_csv: Date.now(),
      region,
      // Default al crear — "No" hasta que alguien lo mueva a mano en el
      // desplegable de Seguimiento (Sí / No / No contestó).
      llamada: "No",
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
  estado: Extract<EstadoMensajeBienvenidaWa, "Enviado" | "Pendiente" | "No se pudo entregar">,
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
//
// Si un admin corrigió los accesos a mano ("Editar accesos"), esta función
// no toca nada — accesosEditadoManual queda como una traba hasta que se
// libere a propósito (ver liberarAccesosEditadoManual), para que un
// recálculo automático (o el job masivo) no borre esa corrección sin
// avisar.
export async function recalcularAccesos(id: string): Promise<Cliente> {
  const { data: fila, error: errLectura } = await supabase.from("clientes").select("*").eq("id", id).maybeSingle();
  if (errLectura) throw errLectura;
  if (!fila) throw new Error("Cliente no encontrado");
  const cliente = filaACliente(fila as ClienteRow);
  if (cliente.accesosEditadoManual) return cliente;

  const inventario = await cargarInventarioBoletos();
  const { accesos, sinInformacion } = calcularAccesos(
    {
      evento: cliente.evento,
      pais: cliente.pais,
      accesoPlataforma: cliente.accesoPlataforma,
      tipoMembresia: cliente.tipoMembresia,
      fechaInscripcion: cliente.fechaInscripcion,
      fechaRenovacion: cliente.fechaRenovacion,
      etiqueta: cliente.etiqueta,
      etiquetaAsignadaEn: cliente.etiquetaAsignadaEn,
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

// Quita la traba de "editado a mano" y recalcula de inmediato — la forma
// de que un admin decida que un cliente vuelva a seguir las reglas
// automáticas después de haber sido corregido manualmente.
export async function liberarAccesosEditadoManual(id: string, autor: string): Promise<Cliente> {
  const { error } = await supabase
    .from("clientes")
    .update({ accesos_editado_manual: false, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await registrarEvento(id, "EDICION_ACCESOS", `Accesos: se quitó la corrección manual, vuelve a calcularse solo (${autor})`, autor);
  return recalcularAccesos(id);
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
  const { data: filaActual, error: errLectura } = await supabase
    .from("clientes")
    .select("fecha_inscripcion,fecha_renovacion")
    .eq("id", id)
    .maybeSingle();
  if (errLectura) throw errLectura;
  if (!filaActual) throw new Error("Cliente no encontrado");

  // fecha_renovacion, no fin_acceso — fecha_inscripcion nunca se toca al
  // renovar (quedan como dos fechas separadas, a propósito). "Fin de
  // acceso" sale de finAccesoCalculado(fechaInscripcion, fechaRenovacion).
  // Si la membresía sigue activa, esto EXTIENDE el fin actual +1 año en vez
  // de reiniciar desde hoy — ver anclaAlRenovar.
  const fechaRenovacion = anclaAlRenovar(filaActual.fecha_inscripcion, filaActual.fecha_renovacion);
  const { data, error } = await supabase
    .from("clientes")
    .update({
      etiqueta: "Renovacion",
      tipo_membresia: "12 Meses",
      acceso_plataforma: "Renovación",
      fecha_renovacion: fechaRenovacion,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;

  const fin = finAccesoCalculado(null, fechaRenovacion);
  await registrarEvento(
    id,
    "RENOVACION",
    `Membresía renovada — Fin de acceso: ${fin ? formatearFechaSkool(fin) : "—"}`,
    autor
  );
  return filaACliente(data as ClienteRow);
}

// Un cliente que YA existe vuelve a comprar uno de los productos del Club
// Sinergético mapeados por Hotmart (ver detectarProductoClubSinergetico, en
// vez de usar el botón "Renovar" del CRM) — funciona casi como una renovación:
// ajusta fecha_renovacion (nunca fecha_inscripcion, quedan como dos fechas
// separadas igual que en renovarMembresia), sube el tipo de membresía solo
// si el nuevo es mayor al que ya tenía, y recalcula los boletos con el
// motor normal por evento (no la regla fija por país de "Renovar" — aquí
// sí se conoce el evento real, así que acceso_plataforma se deja en "Si",
// no en "Renovación").
export async function aplicarCompraHotmartClubSinergetico(
  id: string,
  evento: string,
  tipoMembresiaDetectado: string,
  producto: string
): Promise<Cliente> {
  const { data: fila, error: errLectura } = await supabase.from("clientes").select("*").eq("id", id).maybeSingle();
  if (errLectura) throw errLectura;
  if (!fila) throw new Error("Cliente no encontrado");
  const cliente = filaACliente(fila as ClienteRow);

  const tipoMembresia = mayorMembresia(cliente.tipoMembresia, tipoMembresiaDetectado);
  // Si la membresía sigue activa, esto EXTIENDE el fin actual +1 año en vez
  // de reiniciar desde hoy — ver anclaAlRenovar en fechas.ts.
  const fechaRenovacion = anclaAlRenovar(cliente.fechaInscripcion, cliente.fechaRenovacion);

  const { error } = await supabase
    .from("clientes")
    .update({
      evento,
      tipo_membresia: tipoMembresia,
      acceso_plataforma: "Si",
      fecha_renovacion: fechaRenovacion,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;

  const fin = finAccesoCalculado(null, fechaRenovacion);
  await registrarEvento(
    id,
    "COMPRA_HOTMART",
    `Compra detectada en Hotmart: "${producto}" — funciona como renovación (${tipoMembresia}), fin de acceso: ${fin ? formatearFechaSkool(fin) : "—"}`,
    "Hotmart"
  );

  return recalcularAccesos(id);
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
  const finAccesoActual = finAccesoCalculado(cliente.fechaInscripcion, cliente.fechaRenovacion);
  const { data, error } = await supabase
    .from("clientes")
    .update({
      pausado_en: ahora,
      fin_acceso_al_pausar: finAccesoActual?.toISOString() ?? null,
      actualizado_en: ahora,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;

  await registrarEvento(id, "PAUSA", `Membresía pausada por ${autor}`, autor);
  return filaACliente(data as ClienteRow);
}

// Revoca el acceso de forma permanente (ej. reembolso) — a diferencia de
// "Pausar", no guarda días pendientes para reanudar después: marca "Acceso
// a plataforma" en "Revocado" (no "No" — calcularAccesos() solo reconoce
// "revocado" para anular los boletos, y es el mismo texto que ya usa el
// filtro "Revocados" de la lista) y recalcula de inmediato para que no se
// quede con los boletos de antes de la revocación. Si el cliente estaba
// pausado, se limpia esa pausa para no dejar el botón "Reanudar" sobre un
// acceso que ya se revocó por completo.
export async function revocarAccesoCliente(id: string, autor: string): Promise<Cliente> {
  const ahora = new Date().toISOString();
  const { error } = await supabase
    .from("clientes")
    .update({
      acceso_plataforma: "Revocado",
      pausado_en: null,
      fin_acceso_al_pausar: null,
      actualizado_en: ahora,
    })
    .eq("id", id);
  if (error) throw error;

  await registrarEvento(id, "REVOCACION_ACCESO", `Acceso revocado por ${autor}`, autor);
  return recalcularAccesos(id);
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

  // Respaldo por si finAccesoAlPausar quedó vacío (clientes pausados antes
  // de este cambio): se recalcula con la misma fórmula que usa pausar, en
  // vez de asumir 0 días restantes, que sería castigar al cliente por un
  // hueco de datos que no es su culpa.
  const finAlPausar =
    cliente.finAccesoAlPausar ??
    finAccesoCalculado(cliente.fechaInscripcion, cliente.fechaRenovacion)?.toISOString() ??
    cliente.pausadoEn;
  const diasRestantes = Math.max(0, diasEntreFechas(cliente.pausadoEn, finAlPausar));

  const ahora = new Date();
  const fechaCalculada = new Date(
    Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() + diasRestantes)
  ).toISOString();

  // "Fin de acceso" ya no es un campo aparte — el esquema solo entiende
  // fecha_renovacion + 1 año. Para que el resto del CRM (incluida la regla
  // de Synergy Unlimited 2026) siga leyendo ese único dato sin un caso
  // especial para "reanudado con días de menos", se guarda la fecha que,
  // sumándole 1 año, da exactamente fechaCalculada.
  const fechaRenovacionSintetica = new Date(fechaCalculada);
  fechaRenovacionSintetica.setFullYear(fechaRenovacionSintetica.getFullYear() - 1);

  const { error } = await supabase
    .from("clientes")
    .update({
      pausado_en: null,
      fin_acceso_al_pausar: null,
      fecha_renovacion: fechaRenovacionSintetica.toISOString(),
      actualizado_en: ahora.toISOString(),
    })
    .eq("id", id);
  if (error) throw error;

  await registrarEvento(
    id,
    "REANUDACION",
    `Membresía reanudada por ${autor} — ${diasRestantes} días restantes, fin de acceso recalculado a ${formatearFechaSkool(new Date(fechaCalculada))}`,
    autor
  );

  // Reanudar puede mover el fin de acceso hacia adelante lo suficiente
  // para que el cliente pase a estar activo para Synergy Unlimited 2026 (o
  // para el evento que le toque) — sin este recálculo se quedaba mostrando
  // "Sin acceso" aunque ya le correspondieran boletos.
  const clienteFinal = await recalcularAccesos(id);
  return { cliente: clienteFinal, fechaCalculada, diasRestantes };
}

const CAMPOS_EDITABLES: { key: keyof CambiosDatosCliente; columna: string; label: string }[] = [
  { key: "nombre", columna: "nombre", label: "Nombre" },
  { key: "email", columna: "email", label: "Correo" },
  { key: "telefono", columna: "telefono", label: "Teléfono" },
  { key: "pais", columna: "pais", label: "País" },
  { key: "ciudad", columna: "ciudad", label: "Ciudad" },
  { key: "notas", columna: "notas", label: "Notas" },
  { key: "evento", columna: "evento", label: "Evento" },
  { key: "etiqueta", columna: "etiqueta", label: "Etiqueta" },
  { key: "accesoPlataforma", columna: "acceso_plataforma", label: "Acceso a plataforma" },
  { key: "tipoMembresia", columna: "tipo_membresia", label: "Tipo de membresía" },
  { key: "vencimientoSkool", columna: "vencimiento_skool", label: "Vencimiento Skool" },
  { key: "invitacionSkool", columna: "invitacion_skool", label: "Invitación de Skool" },
  { key: "llamada", columna: "llamada", label: "Llamada" },
  { key: "notasSoporte", columna: "notas_soporte", label: "Notas de soporte técnico" },
];

type CambiosDatosCliente = {
  nombre: string;
  // clientes.id (el correo original de alta) nunca se toca — ver el bloque
  // de emailCambio en actualizarDatosCliente. Vacío/ausente = no se toca el
  // correo actual.
  email?: string | null;
  telefono?: string | null;
  pais?: string | null;
  ciudad?: string | null;
  notas?: string | null;
  evento?: string | null;
  etiqueta?: string | null;
  accesoPlataforma?: string | null;
  tipoMembresia?: string | null;
  vencimientoSkool?: string | null;
  invitacionSkool?: string | null;
  llamada?: string | null;
  notasSoporte?: string | null;
  // "YYYY-MM-DD" (input type=date) o null/vacío para limpiarla. Ya no se
  // edita directo desde ClientePanel (ver finAccesoDeseado abajo) — se
  // manda tal cual para no perder el ancla en los casos donde no hay un
  // "Fin de acceso" editable que mostrar (MÁS+, vitalicio). El botón
  // "Renovar" también la pone sola, por su cuenta.
  fechaRenovacion?: string | null;
  // "YYYY-MM-DD": lo que el admin escribió en el campo editable "Fin de
  // acceso" de ClientePanel. Nunca se guarda tal cual — se traduce a la
  // fecha_renovacion que hay que guardar para que, al recalcularse con
  // finAccesoConEtiqueta(), dé exactamente esta fecha (ver
  // fechaRenovacionDesdeFinDeseado en fechas.ts). Si viene presente, manda
  // sobre fechaRenovacion. No aplica a clientes MÁS+ (vitalicio, sin fecha
  // que editar) — la UI no lo manda para esos casos.
  finAccesoDeseado?: string | null;
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

  // Se calcula antes de armar "nuevos"/detalleTextos a propósito: cuando se
  // le agrega Black Access a alguien cuya membresía YA estaba vencida de
  // verdad (no solo antes del corte de Synergy Unlimited), el acceso se
  // reactiva de verdad — Acceso a plataforma pasa solo a "Si" (nunca a
  // "Renovación": esa etiqueta dispara la regla fija de boletos por país
  // que usa el botón "Renovar" — ver calcularAccesos, boletos.ts — y aquí
  // el evento real del cliente sigue mandando, Black Access solo se suma
  // encima), así el log de cambios y el resto de la función ven el valor
  // final, no el que haya llegado del formulario.
  const nuevaEtiqueta = cambios.etiqueta?.trim() || null;
  const etiquetaCambio = nuevaEtiqueta !== anterior.etiqueta;
  const seAgregaBlackAccess = etiquetaCambio && nuevaEtiqueta?.trim().toLowerCase() === "black access";
  const finAnteriorSinAjuste = finAccesoCalculado(anterior.fechaInscripcion, anterior.fechaRenovacion);
  const membresiaYaVencida = !finAnteriorSinAjuste || finAnteriorSinAjuste < new Date();
  const accesoPlataformaCrudo =
    seAgregaBlackAccess && membresiaYaVencida ? "Si" : cambios.accesoPlataforma;

  // clientes.id (el correo original de alta) nunca se toca — es la llave
  // técnica de URLs/Kajabi histórico/FKs (ninguna trae ON UPDATE CASCADE,
  // ver schema.sql). Cuando el cliente de verdad cambió de correo, solo se
  // actualiza la columna "email" (separada de "id" en el esquema) y el
  // correo viejo se deja registrado en Notas — así no se pierde el rastro
  // de con qué correo se le identificaba antes.
  const nuevoEmail = cambios.email?.trim() ? normalizarEmail(cambios.email) : anterior.email;
  const emailCambio = nuevoEmail !== anterior.email;
  if (emailCambio) {
    const colision = await obtenerCliente(nuevoEmail);
    if (colision && colision.id !== anterior.id) {
      throw new Error(`Ya existe un cliente con el correo "${nuevoEmail}"`);
    }
  }
  const notasConCorreoAnterior = emailCambio
    ? [`Correo anterior: ${anterior.email}`, cambios.notas?.trim() || ""].filter(Boolean).join("\n")
    : cambios.notas?.trim() || "";

  const nuevos: Record<string, string> = {
    nombre: cambios.nombre.trim(),
    email: nuevoEmail,
    telefono: normalizarTelefono(cambios.telefono) ?? "—",
    pais: cambios.pais?.trim() || "—",
    ciudad: cambios.ciudad?.trim() || "—",
    notas: notasConCorreoAnterior || "—",
    evento: cambios.evento?.trim() || "—",
    etiqueta: cambios.etiqueta?.trim() || "—",
    accesoPlataforma: accesoPlataformaCrudo?.trim() || "—",
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
  const nuevoAccesoPlataforma = accesoPlataformaCrudo?.trim() || null;
  const region = await regionParaCrearOEditar(nuevoEvento, nuevoPais);

  // Los cuatro alimentan calcularAccesos() directamente (evento decide
  // contra qué fila del inventario/reglas fijas se calcula, etiqueta decide
  // los extras de MÁS+/Black Access, país decide MX/US, acceso a
  // plataforma decide si aplica la regla de "Renovación"/revocado) — un
  // cambio en cualquiera de ellos deja los boletos guardados
  // desincronizados de lo que le toca de verdad si no se recalcula.
  const eventoCambio = nuevoEvento !== anterior.evento;
  const paisCambio = nuevoPais !== anterior.pais;
  const accesoPlataformaCambio = nuevoAccesoPlataforma !== anterior.accesoPlataforma;

  // Si cambia el tipo de membresía, o si la invitación de Skool pasa a
  // "enviada" (desde el desplegable de Seguimiento), el vencimiento de
  // Skool se recalcula desde la fecha de inscripción — ignora lo que se
  // haya escrito a mano en ese mismo guardado, para no dejar una fecha
  // inconsistente. Sin este segundo disparador, marcar la invitación como
  // enviada sin tocar la membresía dejaba el vencimiento en blanco para
  // siempre (pasó con 558 clientes reales del import).
  const nuevaMembresia = cambios.tipoMembresia?.trim() || null;
  const membresiaCambio = nuevaMembresia !== anterior.tipoMembresia;

  const nuevaInvitacionSkool = cambios.invitacionSkool?.trim() || null;
  const invitacionSkoolKey = nuevaInvitacionSkool?.toLowerCase();
  const invitacionSkoolPasaAEnviada =
    (invitacionSkoolKey === "invitación enviada" || invitacionSkoolKey === "invitacion enviada") &&
    nuevaInvitacionSkool !== anterior.invitacionSkool;

  let vencimientoSkoolTexto = cambios.vencimientoSkool?.trim() || null;
  let vencimientoSkoolFecha = fechaSkoolADateOnly(parsearFechaSkool(vencimientoSkoolTexto));
  if ((membresiaCambio || invitacionSkoolPasaAEnviada) && anterior.fechaInscripcion) {
    const recalculado = calcularVencimientoSkool(anterior.fechaInscripcion, nuevaMembresia);
    vencimientoSkoolTexto = recalculado ? formatearFechaSkool(recalculado) : null;
    vencimientoSkoolFecha = fechaSkoolADateOnly(recalculado);
  }

  const ahora = new Date().toISOString();
  // Ver finAccesoConEtiqueta() (fechas.ts): solo se re-marca cuando la
  // etiqueta de verdad cambia — así el ajuste de Fin de acceso (MÁS+/Black
  // Access) aplica a partir de este cambio, no a los clientes que ya
  // traían la etiqueta de antes (ej. los migrados desde el CSV, que se
  // quedan con etiqueta_asignada_en en null a propósito).
  const etiquetaAsignadaEnNueva = etiquetaCambio ? (nuevaEtiqueta ? ahora : null) : anterior.etiquetaAsignadaEn;

  // seAgregaBlackAccess/membresiaYaVencida ya se calcularon arriba (antes de
  // armar "nuevos", para que Acceso a plataforma reflejara el auto-reactivo
  // desde el primer log) — aquí se reutilizan para la misma condición sobre
  // fecha_renovacion: al agregarle la etiqueta Black Access a alguien cuya
  // membresía YA estaba vencida de verdad (no solo antes del corte de
  // Synergy Unlimited), también se le renueva — antes solo se le ajustaba
  // la fecha que se ve en pantalla (finAccesoConEtiqueta) sin tocar la
  // fecha_renovacion real, dejándolo con Kajabi/Skool caducados aunque el
  // perfil mostrara una fecha vigente. Si ya estaba activa no se toca.
  const finAccesoDeseadoTexto = cambios.finAccesoDeseado?.trim() || null;
  const fechaRenovacionNueva = finAccesoDeseadoTexto
    ? fechaRenovacionDesdeFinDeseado(
        new Date(finAccesoDeseadoTexto),
        nuevaEtiqueta,
        etiquetaAsignadaEnNueva
      ).toISOString()
    : seAgregaBlackAccess && membresiaYaVencida
      ? anclaAlRenovar(anterior.fechaInscripcion, anterior.fechaRenovacion)
      : cambios.fechaRenovacion?.trim()
        ? new Date(cambios.fechaRenovacion.trim()).toISOString()
        : null;
  // Comparar solo la parte de fecha (no la hora): el formulario manda
  // "YYYY-MM-DD" (medianoche UTC al convertir), pero el valor guardado por
  // una renovación real trae hora — comparar el ISO completo daba "cambió"
  // en cada guardado aunque el usuario no hubiera tocado el campo.
  const fechaRenovacionCambio =
    fechaRenovacionNueva?.slice(0, 10) !== anterior.fechaRenovacion?.slice(0, 10);

  const detalle = [
    ...detalleTextos,
    membresiaCambio
      ? `Vencimiento Skool recalculado: "${anterior.vencimientoSkool ?? "—"}" → "${vencimientoSkoolTexto ?? "—"}"`
      : null,
    fechaRenovacionCambio && finAccesoDeseadoTexto
      ? `Fin de acceso: "${(() => {
          const finAnterior = finAccesoConEtiqueta(
            anterior.fechaInscripcion,
            anterior.fechaRenovacion,
            anterior.etiqueta,
            anterior.etiquetaAsignadaEn
          );
          return finAnterior.vitalicio || !finAnterior.fecha ? "—" : formatearFechaSkool(finAnterior.fecha);
        })()}" → "${formatearFechaSkool(new Date(finAccesoDeseadoTexto))}"`
      : fechaRenovacionCambio && seAgregaBlackAccess && membresiaYaVencida
        ? `Se le extendió la membresía por Black Access: "${
            finAnteriorSinAjuste ? formatearFechaSkool(finAnteriorSinAjuste) : "—"
          }" → "${
            fechaRenovacionNueva && finAccesoCalculado(null, fechaRenovacionNueva)
              ? formatearFechaSkool(finAccesoCalculado(null, fechaRenovacionNueva) as Date)
              : "—"
          }"`
        : fechaRenovacionCambio
          ? `Fecha de renovación: "${anterior.fechaRenovacion ? formatearFechaSkool(new Date(anterior.fechaRenovacion)) : "—"}" → "${fechaRenovacionNueva ? formatearFechaSkool(new Date(fechaRenovacionNueva)) : "—"}"`
          : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const { data, error } = await supabase
    .from("clientes")
    .update({
      nombre: cambios.nombre.trim(),
      email: nuevoEmail,
      telefono: normalizarTelefono(cambios.telefono),
      pais: nuevoPais,
      ciudad: cambios.ciudad?.trim() || null,
      notas: notasConCorreoAnterior || null,
      evento: nuevoEvento,
      etiqueta: nuevaEtiqueta,
      etiqueta_asignada_en: etiquetaAsignadaEnNueva,
      acceso_plataforma: nuevoAccesoPlataforma,
      tipo_membresia: nuevaMembresia,
      vencimiento_skool: vencimientoSkoolTexto,
      vencimiento_skool_fecha: vencimientoSkoolFecha,
      invitacion_skool: cambios.invitacionSkool?.trim() || null,
      llamada: cambios.llamada?.trim() || null,
      notas_soporte: cambios.notasSoporte?.trim() || null,
      fecha_renovacion: fechaRenovacionNueva,
      region,
      actualizado_en: ahora,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;

  let clienteFinal = filaACliente(data as ClienteRow);

  // Efectos del cambio de correo — deliberadamente NO bloqueantes: si
  // Kajabi o Skool fallan, el correo ya quedó actualizado en el CRM (con el
  // viejo a salvo en Notas) y la falla queda registrada en la misma línea
  // de la timeline para que el admin la note y lo resuelva a mano. GHL/
  // WhatsApp a propósito no se toca aquí — si el admin quiere actualizarlo
  // ahí, lo hace manual con el botón "Enviar" que ya existe.
  const advertenciasEmail: string[] = [];
  if (emailCambio) {
    if (clienteFinal.kajabiContactId) {
      try {
        await actualizarCorreoContacto(clienteFinal.kajabiContactId, nuevoEmail);
      } catch (err) {
        advertenciasEmail.push(
          `No se pudo actualizar el correo en Kajabi: ${err instanceof Error ? err.message : "error desconocido"}`
        );
      }
    }
    try {
      await invitarASkool(nuevoEmail);
    } catch (err) {
      advertenciasEmail.push(
        `No se pudo enviar la invitación de Skool al correo nuevo: ${err instanceof Error ? err.message : "error desconocido"}`
      );
    }
  }

  const detalleFinal = [detalle, ...advertenciasEmail].filter(Boolean).join(" · ");
  if (detalleFinal) {
    await registrarEvento(id, "EDICION_DATOS", detalleFinal, autor);
  }

  if (membresiaCambio || fechaRenovacionCambio || eventoCambio || etiquetaCambio || paisCambio || accesoPlataformaCambio) {
    clienteFinal = await recalcularAccesos(id);
  }
  return clienteFinal;
}

// Cuando una solicitud (ver solicitudes.ts) llega para un correo que YA es
// cliente — típico caso: alguien que compra Black Access o MÁS+ estando ya
// activo, no un alta nueva — altaCompletaCliente() la rechaza de plano
// ("Ya existe un cliente con ese correo"). Esta función es el camino B para
// ese caso: en vez de dar de alta, le suma la etiqueta que trae la
// solicitud y le extiende el vencimiento de Skool los meses de su
// membresía — a propósito NO toca evento/teléfono/país/nombre (esos ya los
// tiene bien, pisarlos con lo que haya escrito el vendedor en la solicitud
// arriesga corromper datos buenos) y no dispara Kajabi/Skool/GHL (ya tiene
// acceso al Club, esta solicitud es un extra, no un alta).
export async function aplicarSolicitudAClienteExistente(
  clienteId: string,
  cambios: { etiqueta: string | null; tipoMembresia: string | null },
  autor: string
): Promise<Cliente> {
  const { data: filaAnterior, error: errLectura } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", clienteId)
    .maybeSingle();
  if (errLectura) throw errLectura;
  if (!filaAnterior) throw new Error("Cliente no encontrado");
  const anterior = filaACliente(filaAnterior as ClienteRow);

  const ahora = new Date();
  const nuevaEtiqueta = cambios.etiqueta?.trim() || null;
  const etiquetaCambio = nuevaEtiqueta !== anterior.etiqueta;
  const etiquetaAsignadaEnNueva = etiquetaCambio ? (nuevaEtiqueta ? ahora.toISOString() : null) : anterior.etiquetaAsignadaEn;

  const nuevaMembresia = cambios.tipoMembresia?.trim() || anterior.tipoMembresia;

  // Extiende Skool desde donde ya estaba vigente (no le regala menos de lo
  // que ya tenía) o desde hoy si ya había vencido — mismo criterio que
  // anclaAlRenovar() usa para el Club, aplicado aquí a Skool porque esta
  // solicitud sí trae meses de Skool nuevos de verdad (a diferencia de un
  // cambio de etiqueta suelto desde el panel, que no debe tocar Skool).
  const vencimientoActual = parsearFechaSkool(anterior.vencimientoSkool);
  const anclaSkool = vencimientoActual && vencimientoActual > ahora ? vencimientoActual : ahora;
  const nuevoVencimiento = calcularVencimientoSkool(anclaSkool.toISOString(), nuevaMembresia);

  // Mismo criterio que actualizarDatosCliente(): si se le agrega Black
  // Access a alguien cuya membresía del Club YA estaba vencida (no solo
  // antes del corte de Synergy Unlimited — vencida de verdad), también se
  // le renueva de verdad (fecha_renovacion), no solo se le ajusta lo que se
  // ve en pantalla.
  const etiquetaKeyNueva = nuevaEtiqueta?.trim().toLowerCase() ?? "";
  const seAgregaBlackAccess = etiquetaCambio && etiquetaKeyNueva === "black access";
  const finAnteriorSinAjuste = finAccesoCalculado(anterior.fechaInscripcion, anterior.fechaRenovacion);
  const membresiaYaVencida = !finAnteriorSinAjuste || finAnteriorSinAjuste < ahora;
  const fechaRenovacionNueva =
    seAgregaBlackAccess && membresiaYaVencida
      ? anclaAlRenovar(anterior.fechaInscripcion, anterior.fechaRenovacion)
      : anterior.fechaRenovacion;
  // Mismo caso: el acceso se reactiva de verdad — "Si", nunca "Renovación"
  // (esa dispara la regla fija de boletos por país del botón "Renovar"; acá
  // el evento real sigue mandando, Black Access solo se suma encima).
  const accesoPlataformaNuevo = seAgregaBlackAccess && membresiaYaVencida ? "Si" : anterior.accesoPlataforma;

  const { data, error } = await supabase
    .from("clientes")
    .update({
      etiqueta: nuevaEtiqueta,
      etiqueta_asignada_en: etiquetaAsignadaEnNueva,
      tipo_membresia: nuevaMembresia,
      vencimiento_skool: nuevoVencimiento ? formatearFechaSkool(nuevoVencimiento) : anterior.vencimientoSkool,
      vencimiento_skool_fecha: nuevoVencimiento ? fechaSkoolADateOnly(nuevoVencimiento) : null,
      fecha_renovacion: fechaRenovacionNueva,
      acceso_plataforma: accesoPlataformaNuevo,
      actualizado_en: ahora.toISOString(),
    })
    .eq("id", clienteId)
    .select("*")
    .single();
  if (error) throw error;

  const detalle = [
    etiquetaCambio ? `Etiqueta: "${anterior.etiqueta ?? "—"}" → "${nuevaEtiqueta ?? "—"}"` : null,
    `Vencimiento Skool extendido por solicitud: "${anterior.vencimientoSkool ?? "—"}" → "${nuevoVencimiento ? formatearFechaSkool(nuevoVencimiento) : "—"}"`,
    seAgregaBlackAccess && membresiaYaVencida
      ? `Se le extendió la membresía por Black Access: "${
          finAnteriorSinAjuste ? formatearFechaSkool(finAnteriorSinAjuste) : "—"
        }" → "${formatearFechaSkool(finAccesoCalculado(null, fechaRenovacionNueva as string) as Date)}"`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  await registrarEvento(clienteId, "EDICION_DATOS", `${detalle} (solicitud aprobada por ${autor})`, autor);

  return recalcularAccesos(clienteId);
}

const ACCESO_LABEL: Record<keyof Accesos, string> = {
  general: "General",
  vip: "VIP",
  black: "Black Access",
};

function textoAcceso(lista: { activo: boolean; cantidad: number; variante: Variante }[]): string {
  if (lista.length === 0) return "Sin acceso";
  return lista.map((d) => `${d.cantidad}${d.variante ? ` · ${d.variante}` : ""}`).join(" + ");
}

// Guarda los 3 niveles de acceso (General/VIP/Black) en una sola escritura —
// reemplaza el objeto completo en vez de tocar un nivel a la vez, para que
// "quitarle 2 General y darle 2 VIP" sea una sola operación atómica, no dos
// PATCH separados que podrían dejar al cliente en un estado intermedio si
// uno falla. Registra un solo evento "EDICION" listando qué niveles
// cambiaron (igual que actualizarDatosCliente con los demás campos).
//
// Marca accesos_editado_manual — esta es LA acción de override manual del
// CRM: a partir de aquí ningún recálculo automático vuelve a tocar los
// boletos de este cliente hasta que se libere a propósito (ver
// liberarAccesosEditadoManual).
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
    acc[nivel] = nuevosAccesos[nivel]
      .map((d) => ({
        activo: d.cantidad > 0,
        cantidad: Math.max(0, Math.floor(d.cantidad || 0)),
        variante: nivel !== "black" ? d.variante : null,
      }))
      .filter((d) => d.cantidad > 0);
    return acc;
  }, {} as Accesos);

  const cambios = (Object.keys(normalizado) as (keyof Accesos)[])
    .filter((nivel) => JSON.stringify(anterior[nivel]) !== JSON.stringify(normalizado[nivel]))
    .map((nivel) => `${ACCESO_LABEL[nivel]}: ${textoAcceso(anterior[nivel])} → ${textoAcceso(normalizado[nivel])}`);

  const { data, error } = await supabase
    .from("clientes")
    .update({ accesos: normalizado, accesos_editado_manual: true, actualizado_en: new Date().toISOString() })
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

  // Si no hay match directo por id, puede ser un cliente al que le
  // cambiaron el correo desde el CRM (ver actualizarDatosCliente): su id
  // sigue siendo el correo original (nunca se toca), pero Kajabi ya solo
  // conoce el correo nuevo — así que cualquier aviso de Kajabi sobre ese
  // contacto (este webhook, o el cron de sincronización) llega con el
  // correo nuevo. Sin este respaldo por "email" se creaba un cliente
  // duplicado cada vez que Kajabi volvía a avisar algo de ese contacto.
  let existenteOAlias = existente;
  if (!existenteOAlias) {
    const { data: porEmail, error: errAlias } = await supabase
      .from("clientes")
      .select("*")
      .eq("email", id)
      .maybeSingle();
    if (errAlias) throw errAlias;
    existenteOAlias = porEmail;
  }

  let cliente: Cliente;
  let esNuevo = false;

  if (existenteOAlias) {
    cliente = filaACliente(existenteOAlias as ClienteRow);
  } else {
    esNuevo = true;
    const region = await regionParaCrearOEditar(null, null);
    // Prioridad del teléfono: primero lo que haya dejado en espera el
    // webhook de Hotmart (dato real de compra, más reciente), y si no,
    // el que ya tenga capturado en su perfil de Kajabi — así este alta
    // automática arranca con teléfono igual que una manual, sin esperar a
    // que alguien lo escriba a mano.
    const pendientes = await tomarPendientesHotmart(id);
    let telefonoCrudo =
      pendientes.find((p) => p.telefono)?.telefono ?? (await obtenerPerfilKajabi(id).catch(() => null))?.telefono ?? null;

    // Si alguna de las compras en espera es de uno de los productos del
    // Club Sinergético MX mapeados por Hotmart, se le asigna el evento
    // correspondiente desde la creación (con el tipo de membresía más alto
    // entre las que haya, ej. compró 3 Meses y luego hizo upgrade a 1 Año
    // antes de que este sincronizador lo alcanzara a crear).
    let eventoDetectado: string | null = null;
    let tipoMembresiaDetectado: string | null = null;
    for (const p of pendientes) {
      const match = detectarProductoClubSinergetico(p.producto);
      if (!match) continue;
      // Si hubiera compras de dos funnels distintos (raro), gana el evento
      // de la compra con la membresía más alta — es el mismo criterio que
      // ya se usa para decidir la membresía.
      const subeElTipo = mayorMembresia(tipoMembresiaDetectado, match.tipoMembresia) !== tipoMembresiaDetectado;
      tipoMembresiaDetectado = mayorMembresia(tipoMembresiaDetectado, match.tipoMembresia);
      if (subeElTipo || !eventoDetectado) eventoDetectado = match.evento;
    }

    // Si sigue faltando teléfono, tipo de membresía o evento, se completa
    // con el historial de Synergy Axis (mismo que se muestra en la pestaña
    // Historial del perfil) — resiliente, si Axis falla simplemente no se
    // completa nada extra. Evento solo se toma de un puñado de embudos sin
    // ambigüedad (ver EVENTO_ALIAS_AXIS en axis.ts) — el resto se deja vacío
    // a propósito hasta confirmar con el usuario a qué evento corresponden.
    if (!telefonoCrudo || !tipoMembresiaDetectado || !eventoDetectado) {
      try {
        const historialAxis = await obtenerHistorialAxis(id);
        if (historialAxis) {
          if (!telefonoCrudo && historialAxis.contacto.telefono) {
            telefonoCrudo = historialAxis.contacto.telefono;
          }
          if (!tipoMembresiaDetectado) {
            tipoMembresiaDetectado = detectarMembresiaEnComprasAxis(historialAxis.compras);
          }
          if (!eventoDetectado) {
            eventoDetectado = detectarEventoEnAxis(historialAxis);
          }
        }
      } catch {
        // Best-effort: no bloquea el alta si Axis no responde.
      }
    }

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
        orden_csv: Date.now(),
        region,
        // Llegar aquí (alta automática vía tag de Kajabi) significa que
        // Kajabi ya confirmó el acceso — el indicador de la lista debe
        // reflejarlo desde el minuto uno, no quedarse en "sin acceso" solo
        // porque el alta no pasó por el formulario del CRM.
        acceso_plataforma: "Si",
        ...(eventoDetectado ? { evento: eventoDetectado } : {}),
        ...(tipoMembresiaDetectado ? { tipo_membresia: tipoMembresiaDetectado } : {}),
        // Default al crear — "No" hasta que alguien lo mueva a mano en el
        // desplegable de Seguimiento (Sí / No / No contestó).
        llamada: "No",
      })
      .select("*")
      .single();
    if (error) throw error;
    cliente = filaACliente(data as ClienteRow);
    await registrarEvento(id, "CREACION", "Cliente creado automáticamente desde Kajabi", "Kajabi");

    for (const p of pendientes) {
      const match = detectarProductoClubSinergetico(p.producto);
      if (!match) continue;
      const fecha = new Date(p.recibidoEn).toLocaleDateString("es-MX");
      await registrarEvento(
        id,
        "COMPRA_HOTMART",
        `Compra detectada en Hotmart: "${p.producto}" — ${match.tipoMembresia} (${fecha})`,
        "Hotmart"
      );
    }

    if (eventoDetectado) {
      cliente = await recalcularAccesos(id);
    }
  }

  // A partir de aquí siempre el id real del cliente — en el caso de
  // respaldo por alias (arriba), "id" es el correo nuevo que mandó Kajabi,
  // pero cliente.id sigue siendo el correo original congelado. Escribir la
  // timeline con "id" ahí hubiera violado la referencia a clientes(id).
  const idReal = cliente.id;
  const detalle = `Tag de Kajabi asignado: "${tagNombre}"`;
  const { data: yaRegistrado, error: errDup } = await supabase
    .from("eventos_timeline")
    .select("id")
    .eq("cliente_id", idReal)
    .eq("tipo", "KAJABI")
    .eq("detalle", detalle)
    .maybeSingle();
  if (errDup) throw errDup;
  if (!yaRegistrado) {
    await registrarEvento(idReal, "KAJABI", detalle, "Kajabi");
  }

  return { cliente, esNuevo };
}

// Ventana en la que tiene sentido seguir reintentando — pasado esto, si
// Axis nunca tuvo el dato es porque no lo va a tener (o el cliente viene de
// otra fuente, ej. el CSV histórico) y ya no vale la pena seguir gastando
// llamadas a su API en cada corrida del cron.
const DIAS_REINTENTO_AXIS = 7;
const TOPE_REINTENTOS_AXIS = 20;

export type ResultadoReintentoAxis = { revisados: number; completados: number };

// Cuando registrarTagKajabi crea un cliente justo en el momento en que
// Kajabi ya confirmó el acceso pero Axis todavía no terminaba de registrar
// la compra (carrera entre los dos sistemas), el cliente se queda sin
// evento/tipo de membresía para siempre si nadie vuelve a intentar. Esta
// función revisa a los creados recientemente que siguen incompletos y
// reintenta el mismo respaldo de Axis — se llama en cada corrida del cron
// de Kajabi (cada ~15 min) para que se autocorrija solo. Tope de 20 por
// corrida para no alargar la función dentro de maxDuration.
export async function reintentarCompletadoAxis(): Promise<ResultadoReintentoAxis> {
  const desde = new Date();
  desde.setDate(desde.getDate() - DIAS_REINTENTO_AXIS);

  const { data: candidatos, error } = await supabase
    .from("clientes")
    .select("id,telefono,evento,tipo_membresia,fecha_inscripcion")
    .or("tipo_membresia.is.null,evento.is.null")
    .gte("creado_en", desde.toISOString())
    .limit(TOPE_REINTENTOS_AXIS);
  if (error) throw error;
  if (!candidatos || candidatos.length === 0) return { revisados: 0, completados: 0 };

  let completados = 0;
  for (const c of candidatos) {
    try {
      const historial = await obtenerHistorialAxis(c.id);
      if (!historial) continue;

      const cambios: Record<string, unknown> = {};
      if (!c.telefono && historial.contacto.telefono) {
        cambios.telefono = normalizarTelefono(historial.contacto.telefono);
      }
      if (!c.tipo_membresia) {
        const m = detectarMembresiaEnComprasAxis(historial.compras);
        if (m) cambios.tipo_membresia = m;
      }
      if (!c.evento) {
        const e = detectarEventoEnAxis(historial);
        if (e) cambios.evento = e;
      }
      if (Object.keys(cambios).length === 0) continue;

      // El tipo de membresía completado aquí también debe recalcular el
      // vencimiento de Skool — sin esto, a un cliente completado por Axis
      // se le quedaba el tipo de membresía puesto pero "Vence Skool" vacío
      // para siempre (nadie más vuelve a tocar este campo después del alta).
      if (cambios.tipo_membresia && c.fecha_inscripcion) {
        const vencimiento = calcularVencimientoSkool(c.fecha_inscripcion, cambios.tipo_membresia as string);
        cambios.vencimiento_skool = vencimiento ? formatearFechaSkool(vencimiento) : null;
        cambios.vencimiento_skool_fecha = fechaSkoolADateOnly(vencimiento);
      }

      await supabase.from("clientes").update({ ...cambios, actualizado_en: new Date().toISOString() }).eq("id", c.id);
      await registrarEvento(
        c.id,
        "EDICION_DATOS",
        `Completado con datos de Synergy Axis: ${Object.entries(cambios).map(([k, v]) => `${k}=${v}`).join(", ")}`,
        "Axis (reintento)"
      );
      if (cambios.evento || cambios.tipo_membresia) {
        await recalcularAccesos(c.id);
      }
      completados++;
    } catch {
      // Best-effort: un fallo con un candidato no debe tronar el resto.
    }
  }

  return { revisados: candidatos.length, completados };
}

// Tope por corrida: cada candidato cuesta 1-2 llamadas a Kajabi
// (estadoOfertaContacto) — con maxDuration=60s en el mismo cron que ya
// procesa "nuevos" y el reintento de Axis, no conviene revisar cientos de
// golpe.
const TOPE_RECONCILIACION_OFERTA = 30;

// Sin este piso, la cola son ~15,784 clientes vencidos del CSV histórico
// (importados desde antes de que existiera este CRM) — la inmensa mayoría
// nunca va a tener la oferta otra vez en Kajabi, así que revisarlos a todos
// solo gasta llamadas a Kajabi sin encontrar nada, y le quita turno a
// clientes reales que sí renovaron por fuera del CRM. Se limita a partir de
// esta fecha (cuando se acotó la reconciliación) — un cliente viejo del CSV
// que de verdad vuelve a comprar sigue entrando por el alta/webhook normal.
const RECONCILIACION_DESDE = "2026-09-04T00:00:00.000Z";

export type ResultadoReconciliacionOferta = {
  revisados: number;
  reactivados: { id: string; nombre: string; email: string; finAcceso: string }[];
};

// Clientes que ya existen en el CRM, están vencidos (Acceso a plataforma
// no es "Si" ni "Renovación"), pero Kajabi ya les muestra la oferta del
// Club otra vez — típico de quien renueva por un canal que no dispara el
// webhook de Hotmart (ej. un enlace de checkout directo de Kajabi, como los
// de "Enlaces de Renovación" del menú). Nunca se marca acceso_plataforma
// como "Renovación" (esa cadena dispara la regla fija de boletos por país
// que usa el botón "Renovar" — aquí, si se detecta un evento real
// (Hotmart/Axis), se prefiere calcular por ese evento en vez de por el país;
// ver el bloque de detección más abajo). Se llama en cada corrida del cron
// de Kajabi (cada ~15 min) — revisado_oferta_en es el cursor de progreso:
// se actualiza a "ahora" en CADA candidato revisado (haya encontrado algo o
// no), para que la cola siga avanzando en vez de quedarse revisando siempre
// a los mismos primero.
export async function reconciliarOfertasVencidas(): Promise<ResultadoReconciliacionOferta> {
  const { data: candidatos, error } = await supabase
    .from("clientes")
    .select("id,nombre,email,fecha_inscripcion,fecha_renovacion,evento,tipo_membresia")
    .is("eliminado_en", null)
    .is("pausado_en", null)
    .gte("creado_en", RECONCILIACION_DESDE)
    .or("acceso_plataforma.is.null,and(acceso_plataforma.neq.Si,acceso_plataforma.neq.Renovación)")
    .order("revisado_oferta_en", { ascending: true, nullsFirst: true })
    .limit(TOPE_RECONCILIACION_OFERTA);
  if (error) throw error;
  if (!candidatos || candidatos.length === 0) return { revisados: 0, reactivados: [] };

  const reactivados: ResultadoReconciliacionOferta["reactivados"] = [];
  for (const c of candidatos) {
    const ahora = new Date().toISOString();
    try {
      const estado = await estadoOfertaContacto(c.email, KAJABI_OFFER_ID_CLUB_SINERGETICO);
      if (estado !== "activa") {
        await supabase.from("clientes").update({ revisado_oferta_en: ahora }).eq("id", c.id);
        continue;
      }

      // Todo el que llega aquí ya estaba vencido por definición (así se
      // arma la consulta de candidatos) — su evento guardado puede ser de
      // hace mucho y ya no debería mandar en el cálculo de boletos (mismo
      // error que se corrigió a mano con ruelaas3@gmail.com). Antes de
      // resignarse a reusar ese evento viejo, se intenta lo mismo que
      // haría un alta nueva (registrarTagKajabi): primero compras de
      // Hotmart en espera, luego el historial de Axis como respaldo. Si
      // ninguno de los dos revela un evento distinto, se deja el que ya
      // tenía — el aviso de "Reactivaciones automáticas" que se publica al
      // final de esta función existe justo para que admin revise a mano
      // los casos que esta detección no alcance a resolver sola.
      let eventoDetectado: string | null = null;
      let tipoMembresiaDetectado: string | null = null;
      const pendientes = await tomarPendientesHotmart(c.email);
      for (const p of pendientes) {
        const match = detectarProductoClubSinergetico(p.producto);
        if (!match) continue;
        const sube = mayorMembresia(tipoMembresiaDetectado, match.tipoMembresia) !== tipoMembresiaDetectado;
        tipoMembresiaDetectado = mayorMembresia(tipoMembresiaDetectado, match.tipoMembresia);
        if (sube || !eventoDetectado) eventoDetectado = match.evento;
      }
      if (!eventoDetectado) {
        try {
          const historialAxis = await obtenerHistorialAxis(c.email);
          if (historialAxis) {
            eventoDetectado = detectarEventoEnAxis(historialAxis);
            if (!tipoMembresiaDetectado) tipoMembresiaDetectado = detectarMembresiaEnComprasAxis(historialAxis.compras);
          }
        } catch {
          // Best-effort: sin Axis, se sigue con el evento que ya tenía.
        }
      }
      const eventoCambio = !!eventoDetectado && eventoDetectado !== c.evento;

      const fechaRenovacion = anclaAlRenovar(c.fecha_inscripcion, c.fecha_renovacion);
      const cambios: Record<string, unknown> = {
        fecha_renovacion: fechaRenovacion,
        acceso_plataforma: "Si",
        revisado_oferta_en: ahora,
        actualizado_en: ahora,
      };
      if (eventoCambio) {
        cambios.evento = eventoDetectado;
        if (tipoMembresiaDetectado) cambios.tipo_membresia = mayorMembresia(c.tipo_membresia, tipoMembresiaDetectado);
      }

      const { error: errUpdate } = await supabase.from("clientes").update(cambios).eq("id", c.id);
      if (errUpdate) throw errUpdate;

      const fin = finAccesoCalculado(null, fechaRenovacion);
      const finTexto = fin ? formatearFechaSkool(fin) : "—";
      const detalle = eventoCambio
        ? `Se le otorgó Oferta Club Sinergético — se detectó un evento distinto al guardado: "${c.evento ?? "—"}" → "${eventoDetectado}". Fin de acceso: ${finTexto}`
        : `Se le otorgó Oferta Club Sinergético — Fin de acceso: ${finTexto}`;
      await registrarEvento(c.id, "EDICION_DATOS", detalle, "Kajabi");
      await recalcularAccesos(c.id);
      reactivados.push({ id: c.id, nombre: c.nombre, email: c.email, finAcceso: finTexto });
    } catch {
      // Best-effort: un fallo con un candidato no debe tronar el resto — no
      // se le actualiza revisado_oferta_en, así que vuelve a quedar
      // primero en la cola la próxima corrida.
    }
  }

  return { revisados: candidatos.length, reactivados };
}

// --- Teléfonos de Hotmart en espera (ver hotmart_pendientes en schema.sql) ---

export async function guardarTelefonoPendienteHotmart(
  email: string,
  telefono: string,
  producto: string | null
): Promise<void> {
  // Insert, no upsert: puede llegar más de una compra para el mismo correo
  // antes de que el cliente exista en el CRM (ej. compra el paquete chico y
  // el mismo día hace upgrade al grande) — cada una se guarda como su
  // propia fila para no perder ninguna. Ver tomarPendientesHotmart.
  const { error } = await supabase
    .from("hotmart_pendientes")
    .insert({ email: normalizarEmail(email), telefono, producto, recibido_en: new Date().toISOString() });
  if (error) throw error;
}

type PendienteHotmart = { telefono: string; producto: string | null; recibidoEn: string };

// Lee todas las compras en espera para este correo (más vieja primero) y las
// borra en el mismo paso — si no hay nada pendiente, arreglo vacío.
async function tomarPendientesHotmart(email: string): Promise<PendienteHotmart[]> {
  const id = normalizarEmail(email);
  const { data, error } = await supabase
    .from("hotmart_pendientes")
    .select("telefono,producto,recibido_en")
    .eq("email", id)
    .order("recibido_en", { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return [];
  await supabase.from("hotmart_pendientes").delete().eq("email", id);
  return data.map((f) => ({ telefono: f.telefono, producto: f.producto, recibidoEn: f.recibido_en }));
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
  for (const clausula of clausulasBusquedaMultiPalabra(busqueda, ["nombre", "email"])) query = query.or(clausula);
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
  for (const clausula of clausulasBusquedaMultiPalabra(opciones?.busqueda, ["nombre", "email", "telefono"])) query = query.or(clausula);
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
    for (const clausula of clausulasBusquedaMultiPalabra(opciones?.busqueda, ["nombre", "email", "telefono"])) query = query.or(clausula);
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
