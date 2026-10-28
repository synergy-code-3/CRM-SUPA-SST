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
  | "hoja_corregida";

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
      if (d.duplicadoForzado === true) lineas.push("Se confirmó aunque el folio ya existía en otro evento");
      break;
    case "hoja_corregida": {
      if (texto(d.folio)) lineas.push(`Folio ${texto(d.folio)}`);
      const cambios = (d.cambios ?? {}) as Record<string, CambioCampo>;
      for (const [campo, c] of Object.entries(cambios)) {
        lineas.push(`${ETIQUETA_CAMPO[campo] ?? campo}: «${c.antes}» → «${c.despues}»`);
      }
      break;
    }
    default:
      break;
  }
  return lineas;
}
