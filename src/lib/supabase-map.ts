import type { Accesos, AccesoDetalle, Cliente } from "./types";

// Fila cruda tal como vive en la tabla `clientes` de Supabase (snake_case).
// `region` y `vencimiento_skool_fecha` son columnas solo-DB (no forman
// parte del tipo Cliente de la app: la primera es un índice de filtro
// derivado, la segunda es la versión parseada de vencimiento_skool).
export type ClienteRow = {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  pais: string | null;
  ciudad: string | null;
  notas: string | null;
  fecha_inscripcion: string | null;
  fin_acceso: string | null; // legado — ya no se lee ni se escribe, ver fechaRenovacion
  fecha_renovacion: string | null;
  boletos_sin_informacion: boolean;
  orden_csv: number;
  fecha_evento: string | null;
  evento: string | null;
  acceso_plataforma: string | null;
  tipo_membresia: string | null;
  vencimiento_skool: string | null;
  vencimiento_skool_fecha: string | null;
  invitacion_skool: string | null;
  contacto_whats: string | null;
  llamada: string | null;
  notas_soporte: string | null;
  region: string;
  // Forma cruda tal como está en el jsonb — puede ser la vieja (un objeto
  // por categoría) o la nueva (una lista por categoría), ver
  // normalizarAccesos(). Nunca se lee directo, siempre a través de
  // filaACliente().
  accesos: unknown;
  accesos_editado_manual: boolean;
  etiqueta: string | null;
  tags: string[];
  kajabi_contact_id: string | null;
  eliminado_en: string | null;
  pausado_en: string | null;
  fin_acceso_al_pausar: string | null;
  creado_en: string;
  actualizado_en: string;
};

// "accesos" pasó de un objeto único por categoría a una lista por categoría
// (para poder tener VIP MX + VIP US a la vez, ver types.ts). Las filas ya
// guardadas antes de este cambio siguen en la forma vieja hasta que algo
// las recalcula/reedita — en vez de forzar una migración de golpe sobre
// 23k filas, cada lectura sube la forma vieja a la nueva sola.
function normalizarCategoria(v: unknown): AccesoDetalle[] {
  if (Array.isArray(v)) return v as AccesoDetalle[];
  if (v && typeof v === "object" && "cantidad" in v) {
    const d = v as AccesoDetalle;
    return d.cantidad > 0 ? [d] : [];
  }
  return [];
}

export function normalizarAccesos(raw: unknown): Accesos {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    general: normalizarCategoria(r.general),
    vip: normalizarCategoria(r.vip),
    black: normalizarCategoria(r.black),
  };
}

export function filaACliente(r: ClienteRow): Cliente {
  return {
    id: r.id,
    nombre: r.nombre,
    email: r.email,
    telefono: r.telefono,
    pais: r.pais,
    ciudad: r.ciudad,
    notas: r.notas,
    fechaInscripcion: r.fecha_inscripcion,
    fechaRenovacion: r.fecha_renovacion,
    boletosSinInformacion: r.boletos_sin_informacion,
    ordenCsv: r.orden_csv,
    fechaEvento: r.fecha_evento,
    evento: r.evento,
    accesoPlataforma: r.acceso_plataforma,
    tipoMembresia: r.tipo_membresia,
    vencimientoSkool: r.vencimiento_skool,
    invitacionSkool: r.invitacion_skool,
    contactoWhats: r.contacto_whats,
    llamada: r.llamada,
    notasSoporte: r.notas_soporte,
    accesos: normalizarAccesos(r.accesos),
    accesosEditadoManual: r.accesos_editado_manual,
    etiqueta: r.etiqueta,
    tags: r.tags ?? [],
    kajabiContactId: r.kajabi_contact_id,
    eliminadoEn: r.eliminado_en,
    pausadoEn: r.pausado_en,
    finAccesoAlPausar: r.fin_acceso_al_pausar,
    creadoEn: r.creado_en,
    actualizadoEn: r.actualizado_en,
  };
}

// "Vencimiento Skool" es texto libre D/M/YYYY; esta es la versión parseada
// que se guarda en la columna `date` vencimiento_skool_fecha para poder
// filtrar/ordenar por ella en SQL.
export function fechaSkoolADateOnly(fecha: Date | null): string | null {
  if (!fecha) return null;
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
