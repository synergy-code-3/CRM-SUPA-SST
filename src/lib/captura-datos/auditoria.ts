// Historial de movimientos importantes de Captura de Datos (tabla cap_auditoria). Registrar NUNCA debe frenar la acción
// que se está registrando: si falla (p. ej. la tabla aún no existe en Supabase), se anota en la consola del servidor y
// todo sigue. Los textos y tipos compartidos con el navegador viven en historial.ts.
import { supabase } from "@/lib/supabase";
import { diferenciasDeCampos, type AccionAuditoria, type RegistroAuditoria } from "./historial";
import type { HojaCaptura } from "./modelo";

/** Cuánto se conserva el historial; el cron semanal /api/cron/purgar-auditoria borra lo más viejo. */
export const RETENCION_AUDITORIA_DIAS = 365;
const MS_POR_DIA = 24 * 60 * 60 * 1000;
const LIMITE_POR_DEFECTO = 50;
const LIMITE_MAXIMO = 100;

type FilaAuditoria = {
  id: number;
  en: string;
  usuario_id: string | null;
  usuario_nombre: string | null;
  evento_id: string | null;
  evento_nombre: string | null;
  hoja_id: string | null;
  accion: AccionAuditoria;
  detalle: Record<string, unknown> | null;
};

function filaARegistro(f: FilaAuditoria): RegistroAuditoria {
  return {
    id: f.id,
    en: f.en,
    usuarioId: f.usuario_id,
    usuarioNombre: f.usuario_nombre,
    eventoId: f.evento_id,
    eventoNombre: f.evento_nombre,
    hojaId: f.hoja_id,
    accion: f.accion,
    detalle: f.detalle,
  };
}

export interface EntradaAuditoria {
  usuario: { id: string; nombre: string };
  accion: AccionAuditoria;
  eventoId?: string;
  /** Si falta, se busca por eventoId. Al borrar un evento hay que pasarlo (ya no existirá). */
  eventoNombre?: string;
  hojaId?: string;
  detalle?: Record<string, unknown>;
}

/** Guarda un movimiento. No lanza nunca. */
export async function registrarAuditoria(entrada: EntradaAuditoria): Promise<void> {
  try {
    let eventoNombre = entrada.eventoNombre ?? null;
    if (!eventoNombre && entrada.eventoId) {
      const { data } = await supabase.from("cap_eventos").select("nombre").eq("id", entrada.eventoId).maybeSingle();
      eventoNombre = (data as { nombre: string } | null)?.nombre ?? null;
    }
    const { error } = await supabase.from("cap_auditoria").insert({
      usuario_id: entrada.usuario.id,
      usuario_nombre: entrada.usuario.nombre,
      evento_id: entrada.eventoId ?? null,
      evento_nombre: eventoNombre,
      hoja_id: entrada.hojaId ?? null,
      accion: entrada.accion,
      detalle: entrada.detalle ?? null,
    });
    if (error) console.error("captura-datos/auditoria: no se pudo registrar", entrada.accion, error);
  } catch (err) {
    console.error("captura-datos/auditoria: no se pudo registrar", entrada.accion, err);
  }
}

/**
 * Registra una confirmación de hoja. La primera vez es "hoja_confirmada" (solo el folio, no se guardan los datos
 * personales); si la hoja ya estaba confirmada es una corrección: se guardan los campos que cambiaron (antes y después)
 * y, si no cambió nada, no se registra nada.
 */
export async function registrarConfirmacionDeHoja(entrada: {
  usuario: { id: string; nombre: string };
  previa: HojaCaptura;
  hoja: HojaCaptura;
  duplicadoForzado: boolean;
}): Promise<void> {
  const { usuario, previa, hoja } = entrada;
  const base = { usuario, eventoId: hoja.eventoId, hojaId: hoja.id };
  const folio = hoja.campos?.folio ?? hoja.folio ?? "";
  if (previa.estado !== "confirmada") {
    await registrarAuditoria({ ...base, accion: "hoja_confirmada", detalle: { folio, ...(entrada.duplicadoForzado ? { duplicadoForzado: true } : {}) } });
    return;
  }
  const cambios = hoja.campos ? diferenciasDeCampos(previa.campos, hoja.campos) : {};
  if (Object.keys(cambios).length === 0) return;
  await registrarAuditoria({ ...base, accion: "hoja_corregida", detalle: { folio, cambios } });
}

export interface ConsultaAuditoria {
  eventoId?: string;
  /** Cursor: solo registros con id menor a este (los más nuevos van primero). */
  antes?: number;
  limite?: number;
}

/** Los movimientos más recientes primero; `hayMas` indica si queda más historial para pedir con `antes`. */
export async function listarAuditoria(consulta: ConsultaAuditoria = {}): Promise<{ registros: RegistroAuditoria[]; hayMas: boolean }> {
  const limite = Math.min(Math.max(consulta.limite ?? LIMITE_POR_DEFECTO, 1), LIMITE_MAXIMO);
  let q = supabase.from("cap_auditoria").select("*").order("id", { ascending: false }).limit(limite + 1);
  if (consulta.eventoId) q = q.eq("evento_id", consulta.eventoId);
  if (consulta.antes !== undefined) q = q.lt("id", consulta.antes);
  const { data, error } = await q;
  if (error) throw error;
  const filas = data as FilaAuditoria[];
  return { registros: filas.slice(0, limite).map(filaARegistro), hayMas: filas.length > limite };
}

/** Borra los movimientos con más de `dias` días. Devuelve cuántos borró. */
export async function purgarAuditoria(dias: number = RETENCION_AUDITORIA_DIAS): Promise<number> {
  const limite = new Date(Date.now() - dias * MS_POR_DIA).toISOString();
  const { data, error } = await supabase.from("cap_auditoria").delete().lt("en", limite).select("id");
  if (error) throw error;
  return (data ?? []).length;
}
