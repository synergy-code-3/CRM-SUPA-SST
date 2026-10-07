// Coordinación Académica — portado desde una app aparte (Firebase/Firestore,
// "Coordinacion-Club-Sinergetico"). Ver supabase/schema.sql (tablas
// coord_*) y el plan de migración para el contexto completo.
import { supabase } from "@/lib/supabase";

export type TipoMentoria = "lunes-prin" | "lunes-sin" | "martes" | "miercoles" | "jueves" | "viernes";

export const TIPOS_MENTORIA: Record<TipoMentoria, { label: string; horario: string }> = {
  "lunes-prin": { label: "Lunes de Principiante", horario: "12pm" },
  "lunes-sin": { label: "Lunes Sinergético", horario: "7pm" },
  martes: { label: "Martes de Estrategia Digital", horario: "7pm" },
  miercoles: { label: "Miércoles de Creación de Contenido", horario: "7pm" },
  jueves: { label: "Jueves de Estrategia de Venta", horario: "7pm" },
  viernes: { label: "Viernes de Caso de Éxito", horario: "4pm" },
};
export const TIPOS_MENTORIA_VALIDOS: TipoMentoria[] = ["lunes-prin", "lunes-sin", "martes", "miercoles", "jueves", "viernes"];

export type RangoMentor = "Director" | "Lider" | "Abeja";
export const RANGOS_MENTOR: RangoMentor[] = ["Director", "Lider", "Abeja"];

export type Mentor = {
  id: string;
  nombre: string;
  rango: RangoMentor;
  especialidad: string | null;
  descripcion: string | null;
  activo: boolean;
};

export type DifusionChecklist = {
  canva: boolean;
  telegram: boolean;
  whatsapp: boolean;
  marketing: boolean;
  skool: boolean;
};

export type Mentoria = {
  id: string;
  mentorId: string | null;
  mentorNombre: string | null;
  tipoMentoria: TipoMentoria;
  tema: string | null;
  fecha: string; // ISO (date)
  hora: string | null;
  material: boolean;
  notas: string | null;
  copyPrevia: string | null;
  copyPlataforma: string | null;
  audInicial: number | null;
  audMedia: number | null;
  audFinal: number | null;
  obsPub: string | null;
  ideas: string | null;
  preguntas: string | null;
  concluida: boolean;
  difusion: DifusionChecklist;
};

export type EventoInterno = {
  id: string;
  titulo: string;
  fecha: string; // ISO (date)
  color: string | null;
  horaInicio: string | null;
  horaFin: string | null;
  enlace: string | null;
  invitados: string | null;
  notas: string | null;
  descripcion: string | null;
};

// --- Horario de EE. UU. en horario de verano (DST): 2do domingo de marzo
// a 1er domingo de noviembre — usado para el copy de previa (hora por
// ciudad). Se calcula solo de la fecha de la mentoría, ya no es un toggle
// manual como en la app vieja ("Configuración" se quitó por completo).
function esHorarioVeranoEeuu(fechaIso: string): boolean {
  const fecha = new Date(`${fechaIso}T12:00:00Z`);
  const anio = fecha.getUTCFullYear();
  const primerDomingoDeOMes = (mes: number) => {
    const d = new Date(Date.UTC(anio, mes, 1));
    const diasHastaDomingo = (7 - d.getUTCDay()) % 7;
    return 1 + diasHastaDomingo;
  };
  const segundoDomingoMarzo = primerDomingoDeOMes(2) + 7;
  const primerDomingoNoviembre = primerDomingoDeOMes(10);
  const inicio = new Date(Date.UTC(anio, 2, segundoDomingoMarzo));
  const fin = new Date(Date.UTC(anio, 10, primerDomingoNoviembre));
  return fecha >= inicio && fecha < fin;
}

type HorasPorCiudad = { mx_cdmx: string; mx_cancun: string; mx_tij: string; us_la: string; us_ch: string; us_miami: string; gt: string; col: string; do: string };

function bloqueHorario(tipo: TipoMentoria, verano: boolean): string {
  const hora7pm: HorasPorCiudad = {
    mx_cdmx: "7:00 pm", mx_cancun: "8:00 pm", mx_tij: "6:00 pm",
    us_la: verano ? "5:00 pm" : "6:00 pm", us_ch: verano ? "7:00 pm" : "8:00 pm", us_miami: verano ? "8:00 pm" : "9:00 pm",
    gt: "7:00 pm", col: "8:00 pm", do: "9:00 pm",
  };
  const hora12pm: HorasPorCiudad = {
    mx_cdmx: "12:00 pm", mx_cancun: "1:00 pm", mx_tij: "11:00 am",
    us_la: "11:00 am", us_ch: "1:00 pm", us_miami: "2:00 pm",
    gt: "12:00 pm", col: "1:00 pm", do: "2:00 pm",
  };
  const hora4pm: HorasPorCiudad = {
    mx_cdmx: "4:00 pm", mx_cancun: "5:00 pm", mx_tij: "3:00 pm",
    us_la: verano ? "2:00 pm" : "3:00 pm", us_ch: verano ? "4:00 pm" : "5:00 pm", us_miami: verano ? "5:00 pm" : "6:00 pm",
    gt: "4:00 pm", col: "5:00 pm", do: "6:00 pm",
  };
  const H = tipo === "lunes-prin" ? hora12pm : tipo === "viernes" ? hora4pm : hora7pm;
  return `¡Recuerden nuestro nuevo horario!🔥🐝\n🇲🇽 México\nCDMX / Mérida – ${H.mx_cdmx}\nCancún – ${H.mx_cancun}\nTijuana – ${H.mx_tij}\n\n🇺🇸 Estados Unidos\nLos Ángeles / Las Vegas / San Francisco – ${H.us_la}\nChicago / Texas – ${H.us_ch}\nMiami / Nueva York / Atlanta – ${H.us_miami}\n\n🌎 Latinoamérica\n🇬🇹 Guatemala – ${H.gt}\n🇨🇴 Colombia / 🇵🇪 Perú – ${H.col}\n🇩🇴 República Dominicana – ${H.do} 🚀`;
}

// Portados tal cual de la app vieja (buildCopyPrevia/buildCopyPlataforma) —
// mismo texto, mismos links de Skool/Zoom, mismos emojis.
export function construirCopyPrevia(tipo: TipoMentoria, tema: string, mentorNombre: string, fechaIso: string): string {
  const temaTxt = tema || "{tema}";
  const mentor = mentorNombre || "{mentor}";
  const horBlock = bloqueHorario(tipo, esHorarioVeranoEeuu(fechaIso));
  const linkSkool = "https://www.skool.com/club-sinergetico/calendar";
  const notaSkool = `Si ya eres miembro del club Sinergético 🐝 únete ya a la comunidad de Skool!\n\nTema: "${temaTxt}"\n\nLink: ${linkSkool}\n(Nota: Da clic en el día y entra a la mentoría)\n\n${horBlock}`;
  switch (tipo) {
    case "lunes-prin":
      return `✨¡HOY!✨ Tendremos sesión con ${mentor} 🤩\nEn nuestro Lunes de Principiante!\n\nSi ya eres miembro del club Sinergético 🐝 únete ya a la comunidad de Skool!\n\nTema: "${temaTxt}"\n\nLink: ${linkSkool}\n(Nota: Da clic en el día y entra a la mentoría)\n\n${horBlock}`;
    case "lunes-sin":
      return `Excelente día!! 🐝🥂\n\nEsperemos tengan un excelente inicio de semana, hoy tendremos una sesión con ${mentor}.\n\nTema: "${temaTxt}"\n\nLink de acceso: https://us06web.zoom.us/j/88006896319\n\n${horBlock}`;
    case "martes":
      return `✨¡HOY!✨ Tendremos sesión con ${mentor} : Especialista en estrategia digital 🤩\nEn nuestro Martes de Mentoría de Estrategia Digital!\n\n${notaSkool}`;
    case "miercoles":
      return `✨¡HOY!✨ Tendremos sesión con ${mentor} : Especialista en Creación de Contenido 🤩\nEn nuestro Miércoles de Mentoría de Creación de contenido!\n\n${notaSkool}`;
    case "jueves":
      return `✨¡HOY!✨ Tendremos sesión con ${mentor} : Especialista Estrategia de Venta 🤩\nEn nuestro Jueves de Mentoría de Venta!\n\n${notaSkool}`;
    case "viernes":
      return `✨¡HOY!✨ Tendremos sesión con ${mentor} : Caso de Éxito 🤩\nEn nuestro Viernes de Caso de Éxito!\n\n${notaSkool}`;
    default:
      return "";
  }
}

export function construirCopyPlataforma(tipo: TipoMentoria, tema: string, mentorNombre: string): string {
  const tipoLabel = TIPOS_MENTORIA[tipo]?.label ?? tipo;
  return `✨¡YA DISPONIBLE!✨\n\nLa sesión con ${mentorNombre || "{mentor}"} ya está lista para que la veas dentro del Classroom 🤩\n\nEn este ${tipoLabel} 🐝 profundizamos en:\n🎯 "${tema || "{tema}"}"\n\nSi eres miembro activo del Club Sinergético, aprender a conectar a través de tu historia es la clave para elevar tu marca personal 🙌\n\nVe directo a la clase grabada aquí 👇\nhttps://www.skool.com/club-sinergetico/classroom\n\n¡Nos vemos dentro! 🚀`;
}

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
  };
}

const SELECT_MENTORIA = "id, mentor_id, tipo_mentoria, tema, fecha, hora, material, notas, copy_previa, copy_plataforma, aud_inicial, aud_media, aud_final, obs_pub, ideas, preguntas, concluida, coord_mentores(nombre), coord_mentoria_difusion(canva, telegram, whatsapp, marketing, skool)";

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
  const { data, error } = await supabase
    .from("coord_mentorias")
    .insert({
      mentor_id: input.mentorId,
      tipo_mentoria: input.tipoMentoria,
      tema: input.tema.trim() || null,
      fecha: input.fecha,
      hora: input.hora.trim() || null,
      material: input.material,
      notas: input.notas.trim() || null,
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
