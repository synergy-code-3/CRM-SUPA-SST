import { supabase } from "@/lib/supabase";

export type Plataforma = "facebook" | "instagram" | "tiktok" | "skool";
export const PLATAFORMAS_VALIDAS: Plataforma[] = ["facebook", "instagram", "tiktok", "skool"];

export type HistorialComentario = {
  fecha: string;
  usuario: string;
  comentario: string;
  motivo: string;
  accion: "Eliminado" | "Sin acción";
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
        motivo: c.motivo === "—" ? null : c.motivo,
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
const PALABRAS_VACIAS = new Set([
  "que", "para", "con", "los", "las", "una", "uno", "por", "del", "como",
  "esto", "esta", "este", "pero", "mas", "más", "muy", "soy", "eres", "es",
  "son", "fue", "ser", "estan", "están", "donde", "cuando", "porque",
  "tiene", "tienen", "hace", "hacer", "sobre", "entre", "tambien", "también",
  "todo", "toda", "todos", "todas", "nos", "les", "sus", "mis", "tus",
  "se", "lo", "le", "me", "mi", "tu", "el", "la", "un", "en", "de", "a",
  "y", "o", "si", "sí", "no", "yo", "ya", "al",
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

  let qComentarios = supabase
    .from("cm_comentarios")
    .select("creado_en, usuario, comentario, accion, motivo")
    .order("creado_en", { ascending: false });
  if (plataforma) qComentarios = qComentarios.eq("plataforma", plataforma);
  const { data: comentarios, error: errCom } = await qComentarios;
  if (errCom) throw errCom;

  let qPublicaciones = supabase
    .from("cm_publicaciones")
    .select("creado_en, cantidad_interacciones, fecha_revision");
  if (plataforma) qPublicaciones = qPublicaciones.eq("plataforma", plataforma);
  const { data: publicaciones, error: errPub } = await qPublicaciones;
  if (errPub) throw errPub;

  const filas = comentarios ?? [];
  const pubs = publicaciones ?? [];

  const enVentana = (fecha: string, desde: string, hasta?: string) => fecha >= desde && (!hasta || fecha < hasta);

  const comentariosActuales = filas.filter((f) => enVentana(f.creado_en, inicioActual));
  const comentariosAnteriores = filas.filter((f) => enVentana(f.creado_en, inicioAnterior, inicioActual));
  const borradosActuales = comentariosActuales.filter((f) => f.accion === "Eliminado");
  const borradosAnteriores = comentariosAnteriores.filter((f) => f.accion === "Eliminado");
  const pubsActuales = pubs.filter((p) => enVentana(p.creado_en, inicioActual));
  const pubsAnteriores = pubs.filter((p) => enVentana(p.creado_en, inicioAnterior, inicioActual));
  const interaccionesActuales = pubsActuales.reduce((s, p) => s + (p.cantidad_interacciones ?? 0), 0);
  const interaccionesAnteriores = pubsAnteriores.reduce((s, p) => s + (p.cantidad_interacciones ?? 0), 0);

  const motivosMapa = new Map<string, number>();
  for (const f of filas) {
    if (f.accion !== "Eliminado" || !f.motivo) continue;
    motivosMapa.set(f.motivo, (motivosMapa.get(f.motivo) ?? 0) + 1);
  }

  return {
    comentariosRevisados: comentariosActuales.length,
    comentariosRevisadosDelta: calcularDelta(comentariosActuales.length, comentariosAnteriores.length),
    comentariosBorrados: borradosActuales.length,
    comentariosBorradosDelta: calcularDelta(borradosActuales.length, borradosAnteriores.length),
    publicacionesRevisadas: pubsActuales.length,
    publicacionesRevisadasDelta: calcularDelta(pubsActuales.length, pubsAnteriores.length),
    interaccionesTotales: interaccionesActuales,
    interaccionesTotalesDelta: calcularDelta(interaccionesActuales, interaccionesAnteriores),
    motivosEliminacion: [...motivosMapa.entries()].map(([nombre, cantidad]) => ({ nombre, cantidad })),
    palabrasClave: extraerPalabrasClave(filas.map((f) => f.comentario)),
    historial: filas.slice(0, 50).map((f) => ({
      fecha: new Date(f.creado_en).toLocaleDateString("es-MX"),
      usuario: f.usuario,
      comentario: f.comentario,
      motivo: f.motivo ?? "—",
      accion: f.accion as "Eliminado" | "Sin acción",
    })),
  };
}
