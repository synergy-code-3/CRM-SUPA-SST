// Trabajo de varias personas en el mismo evento: quién tiene cada hoja y cuánto lleva confirmado cada quien.
// Sin dependencias de servidor: lo usan los componentes del navegador.
import type { HojaCaptura } from "./modelo";

/** Nombre de cada persona por id (solo las que tienen o confirmaron hojas del evento). */
export type NombresUsuarios = Record<string, string>;

export interface ProgresoPersonas {
  tuyas: number;
  otras: { id: string; nombre: string; confirmadas: number }[];
  pendientes: number;
}

/** La hoja la tiene alguien ahora mismo. Confirmar y marcar no válida limpian el bloqueo, así que una confirmada con bloqueo está en corrección. */
export function bloqueoVigente(h: HojaCaptura, ahora: Date = new Date()): boolean {
  return !!h.bloqueadaPorId && !!h.bloqueadaHasta && new Date(h.bloqueadaHasta) > ahora;
}

/** Otra persona tiene la hoja con un bloqueo vigente (incluye una confirmada que está corrigiendo). */
export function bloqueadaPorOtra(h: HojaCaptura, usuarioId: string, ahora: Date = new Date()): boolean {
  return !!h.bloqueadaPorId && h.bloqueadaPorId !== usuarioId && !!h.bloqueadaHasta && new Date(h.bloqueadaHasta) > ahora;
}

export function iniciales(nombre: string): string {
  const letras = nombre.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
  return letras || "?";
}

export function misHojasEnEdicion(hojas: readonly HojaCaptura[], usuarioId: string, ahora: Date = new Date()): number {
  return hojas.filter((h) => h.bloqueadaPorId === usuarioId && bloqueoVigente(h, ahora)).length;
}

export function progresoPorPersona(hojas: readonly HojaCaptura[], usuarioId: string, nombres: NombresUsuarios): ProgresoPersonas {
  const porPersona = new Map<string, number>();
  for (const h of hojas) {
    if (h.estado === "confirmada" && h.confirmadaPorId) porPersona.set(h.confirmadaPorId, (porPersona.get(h.confirmadaPorId) ?? 0) + 1);
  }
  const otras = [...porPersona]
    .filter(([id]) => id !== usuarioId)
    .map(([id, confirmadas]) => ({ id, nombre: nombres[id] ?? "Otra persona", confirmadas }))
    .sort((a, b) => b.confirmadas - a.confirmadas);
  return {
    tuyas: porPersona.get(usuarioId) ?? 0,
    otras,
    pendientes: hojas.filter((h) => h.estado === "pendiente" || h.estado === "leida").length,
  };
}
