// Cruce entre un cliente del Club y sus hojas de Captura de Datos: no hay llave directa, solo correo y teléfono.
import type { HojaCaptura } from "./modelo";

// Sin comas, paréntesis, comillas ni barras: esos caracteres se saldrían del filtro `in.(...)` de PostgREST.
const CORREO_SEGURO = /^[^\s,()"\\]+@[^\s,()"\\]+$/;

export interface ContactoCliente {
  id: string;
  email: string;
  telefono: string | null;
}

/** Últimos 10 dígitos del teléfono (sin lada ni símbolos), o null si no alcanzan. */
export function telefonoDe10(telefono: string | null | undefined): string | null {
  const digitos = (telefono ?? "").replace(/\D/g, "");
  return digitos.length >= 10 ? digitos.slice(-10) : null;
}

/** Correo actual y el original (clientes.id) en minúsculas, como se guardan en las hojas; descarta los que no son un correo simple. */
export function correosDeCliente(c: ContactoCliente): string[] {
  const correos = [c.email, c.id].map((v) => v.trim().toLowerCase()).filter((v) => CORREO_SEGURO.test(v));
  return [...new Set(correos)];
}

export function hojaPerteneceACliente(hoja: Pick<HojaCaptura, "estado" | "campos">, c: ContactoCliente): boolean {
  if (hoja.estado !== "confirmada" || !hoja.campos) return false;
  const correo = (hoja.campos.correo ?? "").trim().toLowerCase();
  if (correo && correosDeCliente(c).includes(correo)) return true;
  const tel = telefonoDe10(c.telefono);
  return !!tel && hoja.campos.telefono === tel;
}

/** Decodifica el id de la URL; un `%` mal formado se trata como un cliente que no existe (404), no como error del servidor. */
export function decodificar(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return "";
  }
}
