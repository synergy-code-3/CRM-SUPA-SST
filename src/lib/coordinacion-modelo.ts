// Tipos, constantes y funciones puras de Coordinación Académica — nada de
// Supabase/Storage aquí a propósito. Separado de coordinacion.ts (que sí
// los importa) porque varios componentes de cliente ("use client") solo
// necesitan estos tipos/constantes y, al importar del archivo con
// Supabase mezclado, arrastraban el SDK completo al bundle del navegador
// (~150-200 kB extra en cada ruta de Coordinación — ver auditoría de
// performance). coordinacion.ts re-exporta todo esto para que las rutas
// API no tengan que cambiar sus imports.
export type TipoMentoria = "lunes-prin" | "lunes-sin" | "martes" | "miercoles" | "jueves" | "viernes";

// `color` = el mismo color con el que cada mentoría se identifica en
// Skool (tarjetas de "Lunes Sinergético"/"Clase de principiantes"/etc.) —
// se usa para agrupar la lista de Mentorías en carpetas por tipo. "Caso de
// Éxito" (viernes) no tiene un color de marca propio en Skool, se deja en
// gris neutro a propósito.
export const TIPOS_MENTORIA: Record<TipoMentoria, { label: string; horario: string; color: string }> = {
  "lunes-prin": { label: "Lunes de Principiante", horario: "12pm", color: "#F97316" },
  "lunes-sin": { label: "Lunes Sinergético", horario: "7pm", color: "#9B2335" },
  martes: { label: "Martes de Estrategia Digital", horario: "7pm", color: "#0EA5E9" },
  miercoles: { label: "Miércoles de Creación de Contenido", horario: "7pm", color: "#9333EA" },
  jueves: { label: "Jueves de Estrategia de Venta", horario: "7pm", color: "#16A34A" },
  viernes: { label: "Viernes de Caso de Éxito", horario: "4pm", color: "#6B7280" },
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
  flyerUrl: string | null;
};

// Objeto "borrador" para abrir el panel sin haber creado nada todavía en
// Supabase (id: "" marca que es borrador — ver PanelMentoria.tsx). Se usa
// tanto desde Mentorías como desde Calendario.
export function mentoriaVacia(fecha: string, tipoMentoria: TipoMentoria = TIPOS_MENTORIA_VALIDOS[0]): Mentoria {
  return {
    id: "",
    mentorId: null,
    mentorNombre: null,
    tipoMentoria,
    tema: null,
    fecha,
    hora: null,
    material: false,
    notas: null,
    copyPrevia: null,
    copyPlataforma: null,
    audInicial: null,
    audMedia: null,
    audFinal: null,
    obsPub: null,
    ideas: null,
    preguntas: null,
    concluida: false,
    difusion: { canva: false, telegram: false, whatsapp: false, marketing: false, skool: false },
    flyerUrl: null,
  };
}

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

// México (CDMX/Mérida, Guatemala, Colombia/Perú, República Dominicana) no
// tiene horario de verano desde la reforma de 2022, así que su diferencia
// con CDMX es siempre la misma. Cancún (Quintana Roo) tampoco cambia — está
// en UTC-5 fijo todo el año. Tijuana (Baja California) sí sigue el horario
// de verano, igual que EE. UU. (Pacífico) — mismo huso que Los Ángeles, por
// eso usa exactamente los mismos valores que us_la en las 3 tablas de abajo.
function bloqueHorario(tipo: TipoMentoria, verano: boolean): string {
  const hora7pm: HorasPorCiudad = {
    mx_cdmx: "7:00 pm", mx_cancun: "8:00 pm", mx_tij: verano ? "6:00 pm" : "5:00 pm",
    us_la: verano ? "6:00 pm" : "5:00 pm", us_ch: verano ? "8:00 pm" : "7:00 pm", us_miami: verano ? "9:00 pm" : "8:00 pm",
    gt: "7:00 pm", col: "8:00 pm", do: "9:00 pm",
  };
  const hora12pm: HorasPorCiudad = {
    mx_cdmx: "12:00 pm", mx_cancun: "1:00 pm", mx_tij: verano ? "11:00 am" : "10:00 am",
    us_la: verano ? "11:00 am" : "10:00 am", us_ch: verano ? "1:00 pm" : "12:00 pm", us_miami: verano ? "2:00 pm" : "1:00 pm",
    gt: "12:00 pm", col: "1:00 pm", do: "2:00 pm",
  };
  const hora4pm: HorasPorCiudad = {
    mx_cdmx: "4:00 pm", mx_cancun: "5:00 pm", mx_tij: verano ? "3:00 pm" : "2:00 pm",
    us_la: verano ? "3:00 pm" : "2:00 pm", us_ch: verano ? "5:00 pm" : "4:00 pm", us_miami: verano ? "6:00 pm" : "5:00 pm",
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

// --- Exportar a Markdown (botón "Descargar .md" de Mentorías) -----------

function formatearFechaLarga(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function construirMarkdownMentorias(mentorias: Mentoria[]): string {
  const lineas: string[] = ["# Mentorías — Club Sinergético", ""];
  const ordenadas = [...mentorias].sort((a, b) => b.fecha.localeCompare(a.fecha));

  for (const m of ordenadas) {
    const tipo = TIPOS_MENTORIA[m.tipoMentoria]?.label ?? m.tipoMentoria;
    lineas.push(`## ${formatearFechaLarga(m.fecha)} — ${tipo}`);
    lineas.push("");
    lineas.push(`- **Tema:** ${m.tema || "—"}`);
    lineas.push(`- **Mentor:** ${m.mentorNombre || "—"}`);
    lineas.push(`- **Hora:** ${m.hora || "—"}`);
    lineas.push(`- **Estado:** ${m.concluida ? "Concluida" : "En curso"}`);
    lineas.push(`- **Material preparado:** ${m.material ? "Sí" : "No"}`);
    if (m.audInicial != null || m.audMedia != null || m.audFinal != null) {
      lineas.push(`- **Audiencia:** inicial ${m.audInicial ?? "—"} → media ${m.audMedia ?? "—"} → final ${m.audFinal ?? "—"}`);
    }
    if (m.obsPub) lineas.push(`- **Observaciones del público:** ${m.obsPub}`);
    if (m.ideas) lineas.push(`- **Ideas importantes:** ${m.ideas}`);
    if (m.preguntas) lineas.push(`- **Preguntas frecuentes:** ${m.preguntas}`);
    if (m.notas) lineas.push(`- **Notas internas:** ${m.notas}`);
    const difusionHecha = Object.entries(m.difusion).filter(([, v]) => v).map(([k]) => k);
    lineas.push(`- **Difusión completada:** ${difusionHecha.length > 0 ? difusionHecha.join(", ") : "ninguna"}`);
    lineas.push("");
    lineas.push("---");
    lineas.push("");
  }

  return lineas.join("\n");
}
