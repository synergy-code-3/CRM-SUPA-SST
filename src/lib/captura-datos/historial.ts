// Tipos y textos del historial de Captura de Datos. No toca la base de datos: lo usan el servidor (auditoria.ts) y el
// navegador (HistorialModal), por eso no importa nada de Supabase.
import type { SheetFields } from "./fields";

/** Cuánto se conserva el historial; el cron semanal /api/cron/purgar-auditoria borra lo más viejo (ver auditoria.ts). */
export const RETENCION_AUDITORIA_DIAS = 365;

export type AccionAuditoria =
  | "evento_creado"
  | "evento_guardado_drive"
  | "evento_cerrado"
  | "evento_cerrado_auto"
  | "evento_reabierto"
  | "evento_borrado"
  | "hoja_confirmada"
  | "hoja_corregida"
  | "hoja_borrada";

export interface RegistroAuditoria {
  id: number;
  en: string; // ISO
  usuarioId: string | null;
  usuarioNombre: string | null;
  eventoId: string | null;
  eventoNombre: string | null;
  hojaId: string | null;
  accion: AccionAuditoria;
  detalle: Record<string, unknown> | null;
  /** Solo al buscar por nombre: el cliente de una hoja confirmada. */
  clienteNombre?: string;
}

export const ETIQUETA_ACCION: Record<AccionAuditoria, string> = {
  evento_creado: "Creó el evento",
  evento_guardado_drive: "Guardó el evento en Drive",
  evento_cerrado: "Cerró el evento",
  evento_cerrado_auto: "El evento se cerró solo (todas las hojas confirmadas)",
  evento_reabierto: "Reabrió el evento",
  evento_borrado: "Borró el evento",
  hoja_confirmada: "Confirmó una hoja",
  hoja_corregida: "Corrigió una hoja ya confirmada",
  hoja_borrada: "Borró una hoja",
};

export const ACCIONES_AUDITORIA = Object.keys(ETIQUETA_ACCION) as AccionAuditoria[];

/** Nombre corto de cada acción para los filtros del historial. */
export const ETIQUETA_FILTRO_ACCION: Record<AccionAuditoria, string> = {
  evento_creado: "Creado",
  evento_guardado_drive: "Guardado en Drive",
  evento_cerrado: "Cerrado",
  evento_cerrado_auto: "Cerrado solo",
  evento_reabierto: "Reabierto",
  evento_borrado: "Borrado",
  hoja_confirmada: "Hoja confirmada",
  hoja_corregida: "Hoja corregida",
  hoja_borrada: "Hoja borrada",
};

const ETIQUETA_CAMPO: Record<string, string> = {
  folio: "Folio", nombre: "Nombre", correo: "Correo", lada: "Lada", telefono: "Celular", tarjeta: "Últimos 4 dígitos",
  marcaTarjeta: "Marca de tarjeta", metodoPago: "Método de pago", cantidad: "Monto", membresia: "Membresía", notas: "Notas",
};

export interface CambioCampo {
  antes: string;
  despues: string;
}

/** Campos que cambiaron entre dos versiones de una hoja (solo los distintos). `antes` null = no había datos. */
export function diferenciasDeCampos(antes: SheetFields | null, despues: SheetFields): Record<string, CambioCampo> {
  const a = (antes ?? {}) as unknown as Record<string, string | undefined>;
  const d = despues as unknown as Record<string, string | undefined>;
  const cambios: Record<string, CambioCampo> = {};
  for (const clave of new Set([...Object.keys(a), ...Object.keys(d)])) {
    const valorAntes = a[clave] ?? "";
    const valorDespues = d[clave] ?? "";
    if (valorAntes !== valorDespues) cambios[clave] = { antes: valorAntes, despues: valorDespues };
  }
  return cambios;
}

/** Confirmar una hoja en menos de esto (desde que se tomó) se marca como sospechosa de no haberse leído. */
export const SEGUNDOS_CAPTURA_RAPIDA = 15;

export function duracionLegible(segundos: number): string {
  if (segundos < 60) return `${segundos} s`;
  if (segundos < 3600) return `${Math.floor(segundos / 60)} min ${segundos % 60} s`;
  return `${Math.floor(segundos / 3600)} h ${Math.floor((segundos % 3600) / 60)} min`;
}

const HORA = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
export const fechaHoraCompleta = (iso: string) => HORA.format(new Date(iso));

interface DatosCaptura { inicio: string; segundos: number; guardados: number }

function datosCaptura(d: Record<string, unknown> | null): DatosCaptura | null {
  if (!d || typeof d.inicio !== "string" || typeof d.segundos !== "number") return null;
  return { inicio: d.inicio, segundos: d.segundos, guardados: typeof d.guardados === "number" ? d.guardados : 0 };
}

/** Una fila del reporte: lo que una persona capturó en un evento (primera confirmación de cada hoja). */
export interface ResumenCaptura {
  eventoId: string | null;
  eventoNombre: string | null;
  usuarioId: string | null;
  usuario: string;
  hojas: number;
  inicio: string | null;
  fin: string | null;
  promedioSegundos: number | null;
  rapidas: number;
  sinCambios: number;
  sinDatos: number;
}

/** Una hoja capturada, con todo lo medido (para el detalle de una persona). Sin medición = hojas anteriores al reporte. */
export interface HojaDeCaptura {
  hojaId: string | null;
  folio: string;
  inicio: string | null;
  fin: string;
  segundos: number | null;
  guardados: number | null;
  rapida: boolean;
  sinCambios: boolean;
  /** Segundos desde que confirmó la hoja anterior (la primera no tiene). */
  desdeAnteriorSegundos: number | null;
  /** Nombre del archivo de la foto (se completa en el servidor si la hoja aún existe). */
  foto?: string;
  /** "corregida" = edición posterior a la confirmación; "borrada" = se eliminó la hoja (ninguna cuenta en tiempos ni alertas). */
  tipo: "confirmada" | "corregida" | "borrada";
  /** Solo en correcciones: qué cambió; en borradas, el motivo/estado en que estaba. */
  cambios?: string[];
}

/** Agrupa las hojas confirmadas por evento y persona. `rapidas` = confirmadas en menos de SEGUNDOS_CAPTURA_RAPIDA; `sinCambios` = sin ningún guardado desde que se tomó. */
export function resumirCaptura(registros: RegistroAuditoria[]): ResumenCaptura[] {
  const grupos = new Map<string, { resumen: ResumenCaptura; suma: number; medidas: number }>();
  for (const r of registros) {
    const usuario = r.usuarioNombre ?? "Usuario desconocido";
    const clave = `${r.eventoId ?? ""}|${r.usuarioId ?? usuario}`;
    let g = grupos.get(clave);
    if (!g) {
      g = { resumen: { eventoId: r.eventoId, eventoNombre: r.eventoNombre, usuarioId: r.usuarioId, usuario, hojas: 0, inicio: null, fin: null, promedioSegundos: null, rapidas: 0, sinCambios: 0, sinDatos: 0 }, suma: 0, medidas: 0 };
      grupos.set(clave, g);
    }
    const x = g.resumen;
    x.hojas++;
    const c = datosCaptura(r.detalle);
    if (!c) { x.sinDatos++; continue; }
    g.suma += c.segundos;
    g.medidas++;
    const rapida = c.segundos < SEGUNDOS_CAPTURA_RAPIDA;
    const sinCambios = c.guardados === 0;
    if (rapida) x.rapidas++;
    if (sinCambios) x.sinCambios++;
    if (!x.inicio || c.inicio < x.inicio) x.inicio = c.inicio;
    if (!x.fin || r.en > x.fin) x.fin = r.en;
  }
  return [...grupos.values()].map(({ resumen, suma, medidas }) => ({ ...resumen, promedioSegundos: medidas ? Math.round(suma / medidas) : null }));
}

/** Cada hoja confirmada o corregida de los registros dados, de la más antigua a la más reciente. Otras acciones se ignoran. */
export function detalleDeCaptura(registros: RegistroAuditoria[]): HojaDeCaptura[] {
  const orden = registros.filter((r) => r.accion === "hoja_confirmada" || r.accion === "hoja_corregida" || r.accion === "hoja_borrada").sort((a, b) => a.en.localeCompare(b.en) || a.id - b.id);
  let anterior: string | null = null;
  return orden.map((r) => {
    if (r.accion === "hoja_borrada") {
      const cambios = [texto(r.detalle?.foto) && `Foto: ${texto(r.detalle?.foto)}`, texto(r.detalle?.estado) && `Estaba ${texto(r.detalle?.estado).replace("_", " ")}`].filter((x): x is string => !!x);
      return { hojaId: r.hojaId, folio: texto(r.detalle?.folio), inicio: null, fin: r.en, segundos: null, guardados: null, rapida: false, sinCambios: false, desdeAnteriorSegundos: null, tipo: "borrada" as const, cambios };
    }
    if (r.accion === "hoja_corregida") {
      const cambios = Object.entries((r.detalle?.cambios ?? {}) as Record<string, CambioCampo>).map(([campo, c]) => `${ETIQUETA_CAMPO[campo] ?? campo}: «${c.antes}» → «${c.despues}»`);
      return { hojaId: r.hojaId, folio: texto(r.detalle?.folio), inicio: null, fin: r.en, segundos: null, guardados: null, rapida: false, sinCambios: false, desdeAnteriorSegundos: null, tipo: "corregida" as const, cambios };
    }
    const c = datosCaptura(r.detalle);
    const desdeAnteriorSegundos = anterior ? Math.max(0, Math.round((new Date(r.en).getTime() - new Date(anterior).getTime()) / 1000)) : null;
    anterior = r.en;
    return {
      hojaId: r.hojaId, folio: texto(r.detalle?.folio), inicio: c?.inicio ?? null, fin: r.en, segundos: c?.segundos ?? null, guardados: c?.guardados ?? null,
      rapida: !!c && c.segundos < SEGUNDOS_CAPTURA_RAPIDA, sinCambios: !!c && c.guardados === 0, desdeAnteriorSegundos, tipo: "confirmada" as const,
    };
  });
}

/** Movimientos que no son de hojas (crear evento, subir a Drive, cerrar, etc.), del más reciente al más antiguo. */
export const otrosMovimientos = (registros: RegistroAuditoria[]): RegistroAuditoria[] =>
  registros.filter((r) => r.accion !== "hoja_confirmada" && r.accion !== "hoja_corregida" && r.accion !== "hoja_borrada").sort((a, b) => b.en.localeCompare(a.en) || b.id - a.id);

export function estadisticasDeCaptura(hojas: Pick<HojaDeCaptura, "segundos">[]): { medidas: number; minimo: number | null; mediana: number | null; maximo: number | null } {
  const v = hojas.flatMap((h) => (h.segundos === null ? [] : [h.segundos])).sort((a, b) => a - b);
  if (v.length === 0) return { medidas: 0, minimo: null, mediana: null, maximo: null };
  const mitad = Math.floor(v.length / 2);
  return { medidas: v.length, minimo: v[0], mediana: v.length % 2 ? v[mitad] : Math.round((v[mitad - 1] + v[mitad]) / 2), maximo: v[v.length - 1] };
}

const texto = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "");

/** "2026-10-28" → "28/10/2026" (sin pasar por Date, para evitar el desfase de zona horaria). */
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

/** Líneas legibles con el detalle de un movimiento (vacío si no hay nada que añadir). */
export function lineasDeDetalle(r: RegistroAuditoria): string[] {
  const d = r.detalle ?? {};
  const lineas: string[] = [];
  switch (r.accion) {
    case "evento_creado":
      if (texto(d.fecha)) lineas.push(`Fecha del evento: ${fechaCorta(texto(d.fecha))}`);
      if (d.origen === "drive") lineas.push("Fotos desde una carpeta de Drive");
      if (d.origen === "local") lineas.push("Fotos subidas desde la computadora");
      break;
    case "evento_reabierto":
      if (texto(d.motivo)) lineas.push(`Motivo: ${texto(d.motivo)}`);
      break;
    case "evento_borrado":
      if (texto(d.motivo)) lineas.push(`Motivo: ${texto(d.motivo)}`);
      if (typeof d.hojas === "number") lineas.push(`Tenía ${d.hojas} ${d.hojas === 1 ? "hoja" : "hojas"}${texto(d.confirmadas) ? ` (${texto(d.confirmadas)} confirmadas)` : ""}`);
      break;
    case "hoja_confirmada":
      if (texto(d.folio)) lineas.push(`Folio ${texto(d.folio)}`);
      if (r.clienteNombre) lineas.push(`Nombre: ${r.clienteNombre}`);
      if (d.duplicadoForzado === true) lineas.push("Se confirmó aunque el folio ya existía en otro evento");
      lineas.push(...lineasDeCaptura(r));
      break;
    case "hoja_borrada":
      if (texto(d.folio)) lineas.push(`Folio ${texto(d.folio)}`);
      if (texto(d.foto)) lineas.push(`Foto: ${texto(d.foto)}`);
      if (texto(d.estado)) lineas.push(`Estaba ${texto(d.estado).replace("_", " ")}`);
      break;
    case "hoja_corregida": {
      if (texto(d.folio)) lineas.push(`Folio ${texto(d.folio)}`);
      const cambios = (d.cambios ?? {}) as Record<string, CambioCampo>;
      for (const [campo, c] of Object.entries(cambios)) {
        lineas.push(`${ETIQUETA_CAMPO[campo] ?? campo}: «${c.antes}» → «${c.despues}»`);
      }
      lineas.push(...lineasDeCaptura(r));
      break;
    }
    default:
      break;
  }
  return lineas;
}

function lineasDeCaptura(r: RegistroAuditoria): string[] {
  const c = datosCaptura(r.detalle);
  if (!c) return [];
  const rapida = c.segundos < SEGUNDOS_CAPTURA_RAPIDA ? " ⚠ muy rápido" : "";
  return [
    `Inició ${fechaHoraCompleta(c.inicio)} · terminó ${fechaHoraCompleta(r.en)}`,
    `Duración: ${duracionLegible(c.segundos)}${rapida}`,
    c.guardados === 0 ? "Sin cambios guardados mientras la tenía" : `${c.guardados} ${c.guardados === 1 ? "cambio guardado" : "cambios guardados"} mientras la tenía`,
  ];
}
