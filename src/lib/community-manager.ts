import { supabase } from "@/lib/supabase";

export type Plataforma = "facebook" | "instagram" | "tiktok" | "skool";
export const PLATAFORMAS_VALIDAS: Plataforma[] = ["facebook", "instagram", "tiktok", "skool"];

export type HistorialComentario = {
  fecha: string;
  usuario: string;
  comentario: string;
  motivo: string;
  accion: "Eliminado" | "Sin acción" | "Respuesta";
};

export type EstadisticasPlataforma = {
  comentariosRevisados: number;
  comentariosRevisadosDelta: number;
  comentariosBorrados: number;
  comentariosBorradosDelta: number;
  publicacionesRevisadas: number;
  publicacionesRevisadasDelta: number;
  interaccionesTotales: number;
  interaccionesTotalesDelta: number;
  motivosEliminacion: { nombre: string; cantidad: number }[];
  palabrasClave: { nombre: string; cantidad: number }[];
  historial: HistorialComentario[];
};

// --- Guardar un registro de Moderación -------------------------------

export type ComentarioInput = {
  usuario: string;
  comentario: string;
  accion: string;
  motivo: string;
  capturaUrl?: string | null;
};

export async function crearRegistroPublicacion(input: {
  id?: string;
  plataforma: Plataforma;
  enlace: string;
  tipoPublicacion: string;
  fechaRevision: string;
  cantidadComentarios: number;
  cantidadBorrados: number;
  cantidadInteracciones: number;
  esPauta: boolean;
  notas?: string | null;
  comentarios: ComentarioInput[];
  creadoPorId: string;
  creadoPorNombre: string;
}): Promise<{ id: string }> {
  const { data: publicacion, error: errPub } = await supabase
    .from("cm_publicaciones")
    .insert({
      ...(input.id ? { id: input.id } : {}),
      plataforma: input.plataforma,
      enlace: input.enlace.trim(),
      tipo_publicacion: input.tipoPublicacion,
      fecha_revision: input.fechaRevision,
      cantidad_comentarios: input.cantidadComentarios,
      cantidad_borrados: input.cantidadBorrados,
      cantidad_interacciones: input.cantidadInteracciones,
      es_pauta: input.esPauta,
      notas: input.notas?.trim() || null,
      creado_por_id: input.creadoPorId,
      creado_por_nombre: input.creadoPorNombre,
    })
    .select("id")
    .single();
  if (errPub) throw errPub;

  // Filas en blanco (el formulario siempre arranca con 2 vacías) no se
  // guardan — solo las que de verdad se llenaron.
  const comentariosValidos = input.comentarios.filter((c) => c.usuario.trim() && c.comentario.trim());
  if (comentariosValidos.length > 0) {
    const { error: errCom } = await supabase.from("cm_comentarios").insert(
      comentariosValidos.map((c) => ({
        publicacion_id: publicacion.id,
        plataforma: input.plataforma,
        usuario: c.usuario.trim(),
        comentario: c.comentario.trim(),
        accion: c.accion,
        motivo: c.motivo.trim() ? c.motivo.trim() : null,
        captura_url: c.capturaUrl ?? null,
      }))
    );
    if (errCom) throw errCom;
  }

  return { id: publicacion.id as string };
}

// --- Estadísticas (reemplaza los datos de ejemplo) --------------------

const DIAS_VENTANA = 30;
// Palabras demasiado comunes en español como para decir algo por sí
// solas — se descartan antes de contar frecuencia de palabras clave.
// Incluye todas las preposiciones del español (a, ante, bajo, cabe, con,
// contra, de, desde, durante, en, entre, hacia, hasta, mediante, para,
// por, según, sin, so, sobre, tras, vía) — no aportan nada como "palabra
// clave" por sí solas.
const PALABRAS_VACIAS = new Set([
  "que", "para", "con", "los", "las", "una", "uno", "por", "del", "como",
  "esto", "esta", "este", "pero", "mas", "más", "muy", "soy", "eres", "es",
  "son", "fue", "ser", "estan", "están", "donde", "cuando", "porque",
  "tiene", "tienen", "hace", "hacer", "sobre", "entre", "tambien", "también",
  "todo", "toda", "todos", "todas", "nos", "les", "sus", "mis", "tus",
  "se", "lo", "le", "me", "mi", "tu", "el", "la", "un", "en", "de", "a",
  "y", "o", "si", "sí", "no", "yo", "ya", "al",
  // preposiciones restantes (las de arriba ya cubrían con/para/por/sobre/entre/de/en/a)
  "ante", "bajo", "cabe", "contra", "desde", "durante", "hacia", "hasta",
  "mediante", "segun", "según", "sin", "tras", "via", "vía", "versus",
  "eso", "nadie", "cosa",
]);

function calcularDelta(actual: number, anterior: number): number {
  if (anterior === 0) return actual > 0 ? 100 : 0;
  return Math.round(((actual - anterior) / anterior) * 100);
}

function extraerPalabrasClave(textos: string[], limite = 8): { nombre: string; cantidad: number }[] {
  const conteo = new Map<string, number>();
  for (const texto of textos) {
    const palabras = texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // quita acentos para agrupar "más"/"mas"
      .replace(/[^a-z0-9ñ\s]/g, " ")
      .split(/\s+/)
      .filter((p) => p.length >= 3 && !PALABRAS_VACIAS.has(p) && !/^\d+$/.test(p));
    for (const p of palabras) conteo.set(p, (conteo.get(p) ?? 0) + 1);
  }
  return [...conteo.entries()]
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, limite);
}

export async function obtenerEstadisticas(plataforma: Plataforma | null): Promise<EstadisticasPlataforma> {
  const ahora = Date.now();
  const inicioActual = new Date(ahora - DIAS_VENTANA * 86400000).toISOString();
  const inicioAnterior = new Date(ahora - 2 * DIAS_VENTANA * 86400000).toISOString();

  // "Comentarios revisados/borrados" salen de los Números agregados que se
  // capturan por publicación (igual que ya lo llevaban en Sheets) — las
  // filas de cm_comentarios de abajo son solo ejemplos puntuales para
  // "Motivos de eliminación"/Historial, contarlas daría un total ridículo
  // comparado con la realidad (nadie detalla cada comentario uno por uno).
  let qPublicaciones = supabase
    .from("cm_publicaciones")
    .select("creado_en, cantidad_comentarios, cantidad_borrados, cantidad_interacciones");
  if (plataforma) qPublicaciones = qPublicaciones.eq("plataforma", plataforma);
  const { data: publicaciones, error: errPub } = await qPublicaciones;
  if (errPub) throw errPub;

  let qComentarios = supabase
    .from("cm_comentarios")
    .select("creado_en, usuario, comentario, accion, motivo")
    .order("creado_en", { ascending: false });
  if (plataforma) qComentarios = qComentarios.eq("plataforma", plataforma);
  const { data: comentarios, error: errCom } = await qComentarios;
  if (errCom) throw errCom;

  const filas = comentarios ?? [];
  const pubs = publicaciones ?? [];

  const enVentana = (fecha: string, desde: string, hasta?: string) => fecha >= desde && (!hasta || fecha < hasta);

  const pubsActuales = pubs.filter((p) => enVentana(p.creado_en, inicioActual));
  const pubsAnteriores = pubs.filter((p) => enVentana(p.creado_en, inicioAnterior, inicioActual));
  const sumar = (lista: typeof pubs, campo: "cantidad_comentarios" | "cantidad_borrados" | "cantidad_interacciones") =>
    lista.reduce((s, p) => s + (p[campo] ?? 0), 0);

  const motivosMapa = new Map<string, number>();
  for (const f of filas) {
    if (f.accion !== "Eliminado" || !f.motivo) continue;
    motivosMapa.set(f.motivo, (motivosMapa.get(f.motivo) ?? 0) + 1);
  }

  return {
    comentariosRevisados: sumar(pubsActuales, "cantidad_comentarios"),
    comentariosRevisadosDelta: calcularDelta(sumar(pubsActuales, "cantidad_comentarios"), sumar(pubsAnteriores, "cantidad_comentarios")),
    comentariosBorrados: sumar(pubsActuales, "cantidad_borrados"),
    comentariosBorradosDelta: calcularDelta(sumar(pubsActuales, "cantidad_borrados"), sumar(pubsAnteriores, "cantidad_borrados")),
    publicacionesRevisadas: pubsActuales.length,
    publicacionesRevisadasDelta: calcularDelta(pubsActuales.length, pubsAnteriores.length),
    interaccionesTotales: sumar(pubsActuales, "cantidad_interacciones"),
    interaccionesTotalesDelta: calcularDelta(sumar(pubsActuales, "cantidad_interacciones"), sumar(pubsAnteriores, "cantidad_interacciones")),
    motivosEliminacion: [...motivosMapa.entries()].map(([nombre, cantidad]) => ({ nombre, cantidad })),
    palabrasClave: extraerPalabrasClave(filas.map((f) => f.comentario)),
    historial: filas.slice(0, 50).map((f) => ({
      fecha: new Date(f.creado_en).toLocaleDateString("es-MX"),
      usuario: f.usuario,
      comentario: f.comentario,
      motivo: f.motivo ?? "—",
      accion: f.accion as "Eliminado" | "Sin acción" | "Respuesta",
    })),
  };
}

// --- Skool: registro de atención (distinto a las redes sociales) ------
// No hay "publicaciones" ni "comentarios borrados" aquí — es nada más
// "qué preguntaron, qué se respondió". Tabla y forma propias
// (cm_skool_atenciones), sin el campo "estado" (se pidió quitarlo).

export type AtencionSkool = {
  id: string;
  fecha: string; // ISO (date)
  usuario: string;
  pregunta: string;
  respuesta: string;
  creadoEn: string;
};

export async function crearAtencionSkool(input: {
  fecha: string;
  usuario: string;
  pregunta: string;
  respuesta: string;
  creadoPorId: string;
  creadoPorNombre: string;
}): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("cm_skool_atenciones")
    .insert({
      fecha: input.fecha,
      usuario: input.usuario.trim(),
      pregunta: input.pregunta.trim(),
      respuesta: input.respuesta.trim(),
      creado_por_id: input.creadoPorId,
      creado_por_nombre: input.creadoPorNombre,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string };
}

export async function listarAtencionesSkool(busqueda?: string): Promise<AtencionSkool[]> {
  let query = supabase
    .from("cm_skool_atenciones")
    .select("id, fecha, usuario, pregunta, respuesta, creado_en")
    .order("creado_en", { ascending: false })
    .limit(200);
  const q = busqueda?.trim();
  if (q) query = query.or(`usuario.ilike.%${q}%,pregunta.ilike.%${q}%,respuesta.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((f) => ({
    id: f.id as string,
    fecha: f.fecha as string,
    usuario: f.usuario as string,
    pregunta: f.pregunta as string,
    respuesta: f.respuesta as string,
    creadoEn: f.creado_en as string,
  }));
}

export type EstadisticasSkool = {
  totalAtenciones: number;
  atencionesRecientes: number;
  atencionesRecientesDelta: number;
  preguntasComunes: { nombre: string; cantidad: number }[];
};

export async function obtenerEstadisticasSkool(): Promise<EstadisticasSkool> {
  const ahora = Date.now();
  const inicioActual = new Date(ahora - DIAS_VENTANA * 86400000).toISOString();
  const inicioAnterior = new Date(ahora - 2 * DIAS_VENTANA * 86400000).toISOString();

  const { data, error } = await supabase.from("cm_skool_atenciones").select("creado_en, pregunta");
  if (error) throw error;
  const filas = data ?? [];

  const enVentana = (fecha: string, desde: string, hasta?: string) => fecha >= desde && (!hasta || fecha < hasta);
  const actuales = filas.filter((f) => enVentana(f.creado_en, inicioActual));
  const anteriores = filas.filter((f) => enVentana(f.creado_en, inicioAnterior, inicioActual));

  return {
    totalAtenciones: filas.length,
    atencionesRecientes: actuales.length,
    atencionesRecientesDelta: calcularDelta(actuales.length, anteriores.length),
    preguntasComunes: extraerPalabrasClave(filas.map((f) => f.pregunta)),
  };
}

// --- "Recientes" del menú lateral ------------------------------------
// Últimas adiciones de TODO Community Manager (publicaciones de
// Facebook/Instagram/TikTok + atenciones de Skool), mezcladas y
// recortadas a las 3 más nuevas por creado_en.

export type ItemReciente = {
  id: string;
  plataforma: Plataforma;
  descripcion: string;
  creadoEn: string;
  href: string;
};

export async function obtenerRecientesCommunityManager(limite = 3): Promise<ItemReciente[]> {
  const [{ data: pubs, error: errPub }, { data: skool, error: errSkool }] = await Promise.all([
    supabase
      .from("cm_publicaciones")
      .select("id, plataforma, tipo_publicacion, enlace, creado_en")
      .order("creado_en", { ascending: false })
      .limit(limite),
    supabase
      .from("cm_skool_atenciones")
      .select("id, pregunta, creado_en")
      .order("creado_en", { ascending: false })
      .limit(limite),
  ]);
  if (errPub) throw errPub;
  if (errSkool) throw errSkool;

  const itemsPubs: ItemReciente[] = (pubs ?? []).map((p) => ({
    id: p.id,
    plataforma: p.plataforma as Plataforma,
    descripcion: `${p.tipo_publicacion} — ${p.enlace}`,
    creadoEn: p.creado_en,
    href: `/community-manager/moderacion/${p.plataforma}`,
  }));
  const itemsSkool: ItemReciente[] = (skool ?? []).map((s) => ({
    id: s.id,
    plataforma: "skool" as const,
    descripcion: s.pregunta,
    creadoEn: s.creado_en,
    href: "/community-manager/moderacion/skool",
  }));

  return [...itemsPubs, ...itemsSkool].sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : -1)).slice(0, limite);
}
