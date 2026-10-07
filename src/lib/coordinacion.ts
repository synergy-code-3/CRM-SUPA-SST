// Coordinación Académica — portado desde una app aparte (Firebase/Firestore,
// "Coordinacion-Club-Sinergetico"). Ver supabase/schema.sql (tablas
// coord_*) y el plan de migración para el contexto completo.

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
