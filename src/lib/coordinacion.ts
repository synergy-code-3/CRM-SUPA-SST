// Coordinación Académica — portado desde una app aparte (Firebase/Firestore,
// "Coordinacion-Club-Sinergetico"). Ver supabase/schema.sql (tablas
// coord_*) y el plan de migración para el contexto completo.
import { supabase } from "@/lib/supabase";
import { subirAssetFlyer, urlPublicaAssetFlyer, eliminarAssetFlyerStorage, subirFlyerGenerado } from "@/lib/storage";
import { construirCopyPrevia, construirCopyPlataforma, type TipoMentoria, type RangoMentor, type Mentor, type DifusionChecklist, type Mentoria, type EventoInterno } from "@/lib/coordinacion-modelo";

// Tipos/constantes/funciones puras (sin Supabase) viven en coordinacion-modelo.ts
// — se re-exportan aquí para que nada fuera de este archivo tenga que cambiar
// sus imports (las rutas API siguen importando todo de "@/lib/coordinacion").
export * from "@/lib/coordinacion-modelo";

// --- Mentores -----------------------------------------------------------

export async function listarMentores(soloActivos = false): Promise<Mentor[]> {
  let q = supabase.from("coord_mentores").select("id, nombre, rango, especialidad, descripcion, activo").order("nombre");
  if (soloActivos) q = q.eq("activo", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id,
    nombre: m.nombre,
    rango: m.rango as RangoMentor,
    especialidad: m.especialidad,
    descripcion: m.descripcion,
    activo: m.activo,
  }));
}

export async function crearMentor(input: { nombre: string; rango: RangoMentor; especialidad?: string | null; descripcion?: string | null }): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("coord_mentores")
    .insert({
      nombre: input.nombre.trim(),
      rango: input.rango,
      especialidad: input.especialidad?.trim() || null,
      descripcion: input.descripcion?.trim() || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string };
}

// No toca `activo` — la app vieja tenía un bug donde editar un mentor desde
// el modal reactivaba uno que estaba desactivado sin querer. Para eso está
// cambiarMentorActivo() aparte.
export async function actualizarMentor(
  id: string,
  input: { nombre: string; rango: RangoMentor; especialidad?: string | null; descripcion?: string | null }
): Promise<void> {
  const { error } = await supabase
    .from("coord_mentores")
    .update({
      nombre: input.nombre.trim(),
      rango: input.rango,
      especialidad: input.especialidad?.trim() || null,
      descripcion: input.descripcion?.trim() || null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function cambiarMentorActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from("coord_mentores").update({ activo }).eq("id", id);
  if (error) throw error;
}

// --- Mentorías ------------------------------------------------------------

type FilaMentoria = {
  id: string;
  mentor_id: string | null;
  tipo_mentoria: TipoMentoria;
  tema: string | null;
  fecha: string;
  hora: string | null;
  material: boolean;
  notas: string | null;
  copy_previa: string | null;
  copy_plataforma: string | null;
  aud_inicial: number | null;
  aud_media: number | null;
  aud_final: number | null;
  obs_pub: string | null;
  ideas: string | null;
  preguntas: string | null;
  concluida: boolean;
  flyer_url: string | null;
  coord_mentores?: { nombre: string } | null;
  coord_mentoria_difusion?: DifusionChecklist[] | DifusionChecklist | null;
};

function filaAMentoria(f: FilaMentoria): Mentoria {
  const difusionFila = Array.isArray(f.coord_mentoria_difusion) ? f.coord_mentoria_difusion[0] : f.coord_mentoria_difusion;
  return {
    id: f.id,
    mentorId: f.mentor_id,
    mentorNombre: f.coord_mentores?.nombre ?? null,
    tipoMentoria: f.tipo_mentoria,
    tema: f.tema,
    fecha: f.fecha,
    hora: f.hora,
    material: f.material,
    notas: f.notas,
    copyPrevia: f.copy_previa,
    copyPlataforma: f.copy_plataforma,
    audInicial: f.aud_inicial,
    audMedia: f.aud_media,
    audFinal: f.aud_final,
    obsPub: f.obs_pub,
    ideas: f.ideas,
    preguntas: f.preguntas,
    concluida: f.concluida,
    difusion: difusionFila ?? { canva: false, telegram: false, whatsapp: false, marketing: false, skool: false },
    flyerUrl: f.flyer_url,
  };
}

const SELECT_MENTORIA = "id, mentor_id, tipo_mentoria, tema, fecha, hora, material, notas, copy_previa, copy_plataforma, aud_inicial, aud_media, aud_final, obs_pub, ideas, preguntas, concluida, flyer_url, coord_mentores(nombre), coord_mentoria_difusion(canva, telegram, whatsapp, marketing, skool)";

export async function listarMentorias(filtros?: { tipoMentoria?: TipoMentoria; mentorId?: string }): Promise<Mentoria[]> {
  let q = supabase.from("coord_mentorias").select(SELECT_MENTORIA).order("fecha", { ascending: false });
  if (filtros?.tipoMentoria) q = q.eq("tipo_mentoria", filtros.tipoMentoria);
  if (filtros?.mentorId) q = q.eq("mentor_id", filtros.mentorId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((f) => filaAMentoria(f as unknown as FilaMentoria));
}

export async function obtenerMentoria(id: string): Promise<Mentoria | null> {
  const { data, error } = await supabase.from("coord_mentorias").select(SELECT_MENTORIA).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? filaAMentoria(data as unknown as FilaMentoria) : null;
}

export async function crearMentoria(input: {
  mentorId: string | null;
  tipoMentoria: TipoMentoria;
  tema: string;
  fecha: string;
  hora: string;
  material: boolean;
  notas: string;
  creadoPorId: string;
  creadoPorNombre: string;
}): Promise<{ id: string }> {
  // Los copys de difusión se generan solos al crear la mentoría —sea desde
  // el formulario normal (Nueva mentoría) o desde "Crear mentorías de la
  // semana" en Flyers—, con lo que ya se tiene a la mano (tipo/tema/mentor/
  // fecha). El botón "Generar desde tema/mentor" de la pestaña Difusión se
  // queda para recalcularlos a mano si después cambia el tema o el mentor.
  let mentorNombre = "";
  if (input.mentorId) {
    const { data: mentor } = await supabase.from("coord_mentores").select("nombre").eq("id", input.mentorId).maybeSingle();
    mentorNombre = mentor?.nombre ?? "";
  }
  const tema = input.tema.trim();

  const { data, error } = await supabase
    .from("coord_mentorias")
    .insert({
      mentor_id: input.mentorId,
      tipo_mentoria: input.tipoMentoria,
      tema: tema || null,
      fecha: input.fecha,
      hora: input.hora.trim() || null,
      material: input.material,
      notas: input.notas.trim() || null,
      copy_previa: construirCopyPrevia(input.tipoMentoria, tema, mentorNombre, input.fecha),
      copy_plataforma: construirCopyPlataforma(input.tipoMentoria, tema, mentorNombre),
      creado_por_id: input.creadoPorId,
      creado_por_nombre: input.creadoPorNombre,
    })
    .select("id")
    .single();
  if (error) throw error;
  await supabase.from("coord_mentoria_difusion").insert({ mentoria_id: data.id });
  return { id: data.id as string };
}

export async function actualizarInfoMentoria(
  id: string,
  input: { mentorId: string | null; tipoMentoria: TipoMentoria; tema: string; fecha: string; hora: string; material: boolean; notas: string }
): Promise<void> {
  const { error } = await supabase
    .from("coord_mentorias")
    .update({
      mentor_id: input.mentorId,
      tipo_mentoria: input.tipoMentoria,
      tema: input.tema.trim() || null,
      fecha: input.fecha,
      hora: input.hora.trim() || null,
      material: input.material,
      notas: input.notas.trim() || null,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function actualizarDifusionMentoria(
  id: string,
  input: { copyPrevia: string; copyPlataforma: string; checklist: DifusionChecklist }
): Promise<void> {
  const { error: errMentoria } = await supabase
    .from("coord_mentorias")
    .update({ copy_previa: input.copyPrevia, copy_plataforma: input.copyPlataforma, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (errMentoria) throw errMentoria;
  const { error: errChecklist } = await supabase
    .from("coord_mentoria_difusion")
    .upsert({ mentoria_id: id, ...input.checklist });
  if (errChecklist) throw errChecklist;
}

// `concluida` se fija aquí, no es un campo editable — si al guardar la
// Retro hay algo en audiencia final / ideas / preguntas / observaciones,
// la mentoría queda concluida sola (pedido explícito: quitar el estado
// manual y el tablero Kanban que lo usaba).
export async function actualizarRetroMentoria(
  id: string,
  input: { audInicial: number | null; audMedia: number | null; audFinal: number | null; obsPub: string; ideas: string; preguntas: string }
): Promise<{ concluida: boolean }> {
  const concluida = !!(input.audFinal || input.ideas.trim() || input.preguntas.trim() || input.obsPub.trim());
  const { error } = await supabase
    .from("coord_mentorias")
    .update({
      aud_inicial: input.audInicial,
      aud_media: input.audMedia,
      aud_final: input.audFinal,
      obs_pub: input.obsPub.trim() || null,
      ideas: input.ideas.trim() || null,
      preguntas: input.preguntas.trim() || null,
      concluida,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
  return { concluida };
}

export async function eliminarMentoria(id: string): Promise<void> {
  const { error } = await supabase.from("coord_mentorias").delete().eq("id", id);
  if (error) throw error;
}

// --- Eventos internos del calendario (reuniones, webinars) ---------------

type FilaEvento = {
  id: string;
  titulo: string;
  fecha: string;
  color: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  enlace: string | null;
  invitados: string | null;
  notas: string | null;
  descripcion: string | null;
};

function filaAEvento(f: FilaEvento): EventoInterno {
  return {
    id: f.id,
    titulo: f.titulo,
    fecha: f.fecha,
    color: f.color,
    horaInicio: f.hora_inicio,
    horaFin: f.hora_fin,
    enlace: f.enlace,
    invitados: f.invitados,
    notas: f.notas,
    descripcion: f.descripcion,
  };
}

const SELECT_EVENTO = "id, titulo, fecha, color, hora_inicio, hora_fin, enlace, invitados, notas, descripcion";

export async function listarEventos(rango?: { desde: string; hasta: string }): Promise<EventoInterno[]> {
  let q = supabase.from("coord_eventos").select(SELECT_EVENTO).order("fecha");
  if (rango) q = q.gte("fecha", rango.desde).lte("fecha", rango.hasta);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((f) => filaAEvento(f as FilaEvento));
}

export async function crearEvento(input: {
  titulo: string;
  fecha: string;
  color?: string | null;
  horaInicio?: string | null;
  horaFin?: string | null;
  enlace?: string | null;
  invitados?: string | null;
  notas?: string | null;
  descripcion?: string | null;
  creadoPorId: string;
  creadoPorNombre: string;
}): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("coord_eventos")
    .insert({
      titulo: input.titulo.trim(),
      fecha: input.fecha,
      color: input.color || null,
      hora_inicio: input.horaInicio || null,
      hora_fin: input.horaFin || null,
      enlace: input.enlace?.trim() || null,
      invitados: input.invitados?.trim() || null,
      notas: input.notas?.trim() || null,
      descripcion: input.descripcion?.trim() || null,
      creado_por_id: input.creadoPorId,
      creado_por_nombre: input.creadoPorNombre,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string };
}

export async function actualizarEvento(
  id: string,
  input: {
    titulo: string;
    fecha: string;
    color?: string | null;
    horaInicio?: string | null;
    horaFin?: string | null;
    enlace?: string | null;
    invitados?: string | null;
    notas?: string | null;
    descripcion?: string | null;
  }
): Promise<void> {
  const { error } = await supabase
    .from("coord_eventos")
    .update({
      titulo: input.titulo.trim(),
      fecha: input.fecha,
      color: input.color || null,
      hora_inicio: input.horaInicio || null,
      hora_fin: input.horaFin || null,
      enlace: input.enlace?.trim() || null,
      invitados: input.invitados?.trim() || null,
      notas: input.notas?.trim() || null,
      descripcion: input.descripcion?.trim() || null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function eliminarEvento(id: string): Promise<void> {
  const { error } = await supabase.from("coord_eventos").delete().eq("id", id);
  if (error) throw error;
}

// --- Generador de flyers -------------------------------------------------

export type CategoriaFlyerAsset = "fondo" | "foto";

export type FlyerAsset = {
  id: string;
  categoria: CategoriaFlyerAsset;
  etiqueta: string;
  archivoNombre: string;
  url: string;
  creadoEn: string;
};

export async function listarFlyerAssets(): Promise<FlyerAsset[]> {
  const { data, error } = await supabase
    .from("coord_flyer_assets")
    .select("id, categoria, etiqueta, archivo_nombre, ruta, creado_en")
    .order("etiqueta");
  if (error) throw error;
  return (data ?? []).map((a) => ({
    id: a.id,
    categoria: a.categoria as CategoriaFlyerAsset,
    etiqueta: a.etiqueta,
    archivoNombre: a.archivo_nombre,
    url: urlPublicaAssetFlyer(a.ruta),
    creadoEn: a.creado_en,
  }));
}

// Reemplaza (upsert) la imagen de esta categoría+etiqueta si ya existía —
// mismo criterio que avatares: subir de nuevo pisa la anterior, nunca se
// acumulan versiones viejas en el bucket.
export async function guardarFlyerAsset(
  categoria: CategoriaFlyerAsset,
  etiqueta: string,
  archivo: File,
  autor: string
): Promise<FlyerAsset> {
  const ruta = await subirAssetFlyer(categoria, etiqueta, archivo);
  const { data, error } = await supabase
    .from("coord_flyer_assets")
    .upsert(
      { categoria, etiqueta, archivo_nombre: archivo.name, ruta, subido_por: autor },
      { onConflict: "categoria,etiqueta" }
    )
    .select("id, categoria, etiqueta, archivo_nombre, ruta, creado_en")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    categoria: data.categoria as CategoriaFlyerAsset,
    etiqueta: data.etiqueta,
    archivoNombre: data.archivo_nombre,
    url: urlPublicaAssetFlyer(data.ruta),
    creadoEn: data.creado_en,
  };
}

export async function eliminarFlyerAsset(id: string): Promise<void> {
  const { data, error: errLectura } = await supabase.from("coord_flyer_assets").select("ruta").eq("id", id).maybeSingle();
  if (errLectura) throw errLectura;
  if (!data) return;
  await eliminarAssetFlyerStorage(data.ruta);
  const { error } = await supabase.from("coord_flyer_assets").delete().eq("id", id);
  if (error) throw error;
}

export type LayoutFlyer = {
  px: number; py: number; pw: number; ph: number; pz: number;
  tx: number; ty: number; tw: number; ts: number;
  nx: number; ny: number; ns: number;
  opacidadFondo: number;
  alineacionTema: "left" | "center" | "right";
  sombraTamano: number;
  sombraOpacidad: number;
  fx: number;
  fy: number;
};

export async function listarFlyerLayouts(): Promise<Record<string, LayoutFlyer>> {
  const { data, error } = await supabase.from("coord_flyer_layouts").select("tipo_mentoria, cfg");
  if (error) throw error;
  const mapa: Record<string, LayoutFlyer> = {};
  for (const fila of data ?? []) mapa[fila.tipo_mentoria] = fila.cfg as LayoutFlyer;
  return mapa;
}

export async function guardarFlyerLayout(tipoMentoria: TipoMentoria, cfg: LayoutFlyer): Promise<void> {
  const { error } = await supabase
    .from("coord_flyer_layouts")
    .upsert({ tipo_mentoria: tipoMentoria, cfg, actualizado_en: new Date().toISOString() }, { onConflict: "tipo_mentoria" });
  if (error) throw error;
}

// Guarda el PNG final del flyer (ya acomodado a mano) y lo enlaza a su
// mentoría — path fijo por mentoriaId (upsert), así que volver a guardar
// reemplaza la versión anterior en vez de acumular archivos viejos. Se ve
// después en la pestaña Difusión de esa misma mentoría.
export async function guardarFlyerMentoria(mentoriaId: string, archivo: Blob): Promise<string> {
  const ruta = await subirFlyerGenerado(mentoriaId, archivo);
  const url = urlPublicaAssetFlyer(ruta);
  const { error } = await supabase
    .from("coord_mentorias")
    .update({ flyer_url: url, actualizado_en: new Date().toISOString() })
    .eq("id", mentoriaId);
  if (error) throw error;
  return url;
}

// Borra los PNG de flyer ya guardados de mentorías con más de 30 días desde
// su fecha (pedido explícito: evitar que el bucket de Storage crezca sin
// límite) — la mentoría en sí NUNCA se toca, sigue viéndose en Mentorías/
// Calendario con su historial completo, solo se le quita el flyer. Invocado
// por el Cron Job de Vercel (ver vercel.json), una vez al día.
export async function limpiarFlyersVencidos(): Promise<{ eliminados: number; fallidos: number }> {
  const haceUnMes = new Date();
  haceUnMes.setDate(haceUnMes.getDate() - 30);
  const corte = haceUnMes.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("coord_mentorias")
    .select("id")
    .not("flyer_url", "is", null)
    .lt("fecha", corte);
  if (error) throw error;

  let eliminados = 0;
  let fallidos = 0;
  for (const fila of data ?? []) {
    try {
      // Best-effort en el storage: si el archivo ya no estuviera (borrado a
      // mano, lo que sea), no debe impedir limpiar el campo en la mentoría.
      await eliminarAssetFlyerStorage(`generado/${fila.id}.png`).catch(() => {});
      const { error: errUpdate } = await supabase
        .from("coord_mentorias")
        .update({ flyer_url: null })
        .eq("id", fila.id);
      if (errUpdate) throw errUpdate;
      eliminados++;
    } catch {
      fallidos++;
    }
  }
  return { eliminados, fallidos };
}
