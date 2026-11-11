// Hojas repetidas (mismo teléfono en el mismo estado del evento). Una queda como principal (la que se captura y va a la
// Hoja de cálculo) y las demás como secundarias: se ven, su foto va a Drive, pero no se editan ni cuentan.
import type { HojaCaptura } from "./modelo";

export function telefonoClave(telefono: string | null | undefined): string | null {
  const digitos = (telefono ?? "").replace(/\D/g, "");
  return digitos.length >= 10 ? digitos.slice(-10) : null;
}

export const esSecundaria = (h: HojaCaptura) => !!h.origen.principalId;

/** La hoja y sus repetidas (incluye secundarias ya vinculadas); vacío si no tiene repetidas. */
export function grupoDuplicadas(hojas: readonly HojaCaptura[], hoja: HojaCaptura, telefono = hoja.campos?.telefono): HojaCaptura[] {
  const clave = telefonoClave(telefono);
  if (!clave) return [];
  const grupo = hojas.filter((h) => h.id !== hoja.id && h.estatus === hoja.estatus && (h.estado !== "no_valida" || esSecundaria(h)) && telefonoClave(h.campos?.telefono) === clave);
  return grupo.length ? [hoja, ...grupo] : [];
}

/** Hay más de una hoja del grupo sin vincular como secundaria. */
export const sinVincular = (grupo: readonly HojaCaptura[]) => grupo.filter((h) => !esSecundaria(h)).length > 1;
