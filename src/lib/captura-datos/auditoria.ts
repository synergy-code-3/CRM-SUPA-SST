// Historial de movimientos importantes de Captura de Datos (tabla cap_auditoria). Registrar NUNCA debe frenar la acción
// que se está registrando: si falla (p. ej. la tabla aún no existe en Supabase), se anota en la consola del servidor y
// todo sigue. Los textos y tipos compartidos con el navegador viven en historial.ts.
import { supabase } from "@/lib/supabase";
import { diferenciasDeCampos, RETENCION_AUDITORIA_DIAS, type AccionAuditoria, type RegistroAuditoria } from "./historial";
import type { HojaCaptura } from "./modelo";

export { RETENCION_AUDITORIA_DIAS };
const MS_POR_DIA = 24 * 60 * 60 * 1000;
const LIMITE_POR_DEFECTO = 25;
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

/** Cuándo se tomó la hoja, cuánto pasó hasta confirmarla y cuántos autoguardados hizo la persona entretanto (vacío si no se sabe). */
function datosDeCaptura(previa: HojaCaptura, hoja: HojaCaptura): Record<string, unknown> {
  if (!previa.tomadaEn) return {};
  const fin = hoja.confirmadaEn ? new Date(hoja.confirmadaEn).getTime() : Date.now();
  const segundos = Math.max(0, Math.round((fin - new Date(previa.tomadaEn).getTime()) / 1000));
  const guardados = previa.guardadosDesdeToma ?? 0;
  return { inicio: previa.tomadaEn, segundos, guardados };
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
  const captura = datosDeCaptura(previa, hoja);
  const folio = hoja.campos?.folio ?? hoja.folio ?? "";
  if (previa.estado !== "confirmada") {
    await registrarAuditoria({ ...base, accion: "hoja_confirmada", detalle: { folio, ...(entrada.duplicadoForzado ? { duplicadoForzado: true } : {}), ...captura } });
    return;
  }
  const cambios = hoja.campos ? diferenciasDeCampos(previa.campos, hoja.campos) : {};
  if (Object.keys(cambios).length === 0) return;
  await registrarAuditoria({ ...base, accion: "hoja_corregida", detalle: { folio, cambios, ...captura } });
}

export interface ConsultaAuditoria {
  eventoId?: string;
  /** Cursor: solo registros con id menor a este (los más nuevos van primero). */
  antes?: number;
  /** Solo registros con id mayor a este (lo nuevo desde la última vez que se vio la lista). */
  desde?: number;
  limite?: number;
  /** Texto libre: evento, admin, folio, motivo o nombre del cliente en una corrección. */
  q?: string;
  /** Texto que debe contener el nombre del evento (el lugar suele ir en el nombre). */
  lugar?: string;
  acciones?: AccionAuditoria[];
  /** Rango (ISO) sobre el momento del movimiento. */
  fechaDesde?: string;
  fechaHasta?: string;
}

// Los caracteres que usa la sintaxis de .or() de PostgREST se quitan del texto buscado.
const limpiarBusqueda = (t: string) => t.replace(/[,()"\\%*]/g, " ").trim();
const MAX_HOJAS_POR_NOMBRE = 200;

/** Hojas cuyo cliente se llama así (id → nombre): el movimiento de confirmar no guarda el nombre, solo el folio. */
async function hojasConNombre(texto: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("cap_hojas").select("id, nombre:campos->>nombre").ilike("campos->>nombre", `%${texto}%`).limit(MAX_HOJAS_POR_NOMBRE);
  if (error) throw error;
  return new Map((data as unknown as { id: string; nombre: string | null }[]).map((h) => [h.id, h.nombre ?? ""]));
}

/** Los movimientos más recientes primero; `hayMas` indica si queda más historial para pedir con `antes`. */
export async function listarAuditoria(consulta: ConsultaAuditoria = {}): Promise<{ registros: RegistroAuditoria[]; hayMas: boolean }> {
  const limite = Math.min(Math.max(consulta.limite ?? LIMITE_POR_DEFECTO, 1), LIMITE_MAXIMO);
  let q = supabase.from("cap_auditoria").select("*").order("id", { ascending: false }).limit(limite + 1);
  if (consulta.eventoId) q = q.eq("evento_id", consulta.eventoId);
  if (consulta.antes !== undefined) q = q.lt("id", consulta.antes);
  if (consulta.desde !== undefined) q = q.gt("id", consulta.desde);
  if (consulta.acciones?.length) q = q.in("accion", consulta.acciones);
  if (consulta.fechaDesde) q = q.gte("en", consulta.fechaDesde);
  if (consulta.fechaHasta) q = q.lte("en", consulta.fechaHasta);
  const lugar = limpiarBusqueda(consulta.lugar ?? "");
  if (lugar) q = q.ilike("evento_nombre", `%${lugar}%`);
  const texto = limpiarBusqueda(consulta.q ?? "");
  let nombres = new Map<string, string>();
  if (texto) {
    const campos = ["evento_nombre", "usuario_nombre", "detalle->>folio", "detalle->>motivo", "detalle->cambios->nombre->>antes", "detalle->cambios->nombre->>despues"];
    const condiciones = campos.map((c) => `${c}.ilike.%${texto}%`);
    nombres = await hojasConNombre(texto);
    if (nombres.size) condiciones.push(`hoja_id.in.(${[...nombres.keys()].join(",")})`);
    q = q.or(condiciones.join(","));
  }
  const { data, error } = await q;
  if (error) throw error;
  const filas = data as FilaAuditoria[];
  const registros = filas.slice(0, limite).map((f) => {
    const clienteNombre = f.accion === "hoja_confirmada" && f.hoja_id ? nombres.get(f.hoja_id) : undefined;
    return clienteNombre ? { ...filaARegistro(f), clienteNombre } : filaARegistro(f);
  });
  return { registros, hayMas: filas.length > limite };
}

const TOPE_CONFIRMACIONES = 5000;

/** Las hojas confirmadas (primera vez) de un evento o rango, para el reporte de captura. `truncado` = había más que el tope. */
export async function listarConfirmaciones(c: { eventoId?: string; usuarioId?: string; fechaDesde?: string; fechaHasta?: string }): Promise<{ registros: RegistroAuditoria[]; truncado: boolean }> {
  let q = supabase.from("cap_auditoria").select("*").eq("accion", "hoja_confirmada").order("id", { ascending: false }).limit(TOPE_CONFIRMACIONES + 1);
  if (c.eventoId) q = q.eq("evento_id", c.eventoId);
  if (c.usuarioId) q = q.eq("usuario_id", c.usuarioId);
  if (c.fechaDesde) q = q.gte("en", c.fechaDesde);
  if (c.fechaHasta) q = q.lte("en", c.fechaHasta);
  const { data, error } = await q;
  if (error) throw error;
  const filas = (data ?? []) as FilaAuditoria[];
  return { registros: filas.slice(0, TOPE_CONFIRMACIONES).map(filaARegistro), truncado: filas.length > TOPE_CONFIRMACIONES };
}

/** Borra los movimientos con más de `dias` días. Devuelve cuántos borró. */
export async function purgarAuditoria(dias: number = RETENCION_AUDITORIA_DIAS): Promise<number> {
  const limite = new Date(Date.now() - dias * MS_POR_DIA).toISOString();
  const { data, error } = await supabase.from("cap_auditoria").delete().lt("en", limite).select("id");
  if (error) throw error;
  return (data ?? []).length;
}

const HOJAS_POR_CONSULTA = 200;

/** Nombre del archivo de cada hoja que aún existe (id → nombre). Las de eventos borrados no aparecen. */
export async function nombresDeFotos(ids: string[]): Promise<Map<string, string>> {
  const nombres = new Map<string, string>();
  for (let i = 0; i < ids.length; i += HOJAS_POR_CONSULTA) {
    const { data, error } = await supabase.from("cap_hojas").select("id, origen").in("id", ids.slice(i, i + HOJAS_POR_CONSULTA));
    if (error) throw error;
    for (const h of (data ?? []) as { id: string; origen: { nombreOriginal?: string; pagina?: number } | null }[]) {
      if (h.origen?.nombreOriginal) nombres.set(h.id, h.origen.pagina ? `${h.origen.nombreOriginal} (pág. ${h.origen.pagina})` : h.origen.nombreOriginal);
    }
  }
  return nombres;
}
