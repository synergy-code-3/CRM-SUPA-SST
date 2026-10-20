// Compara lo que leyó la IA con el contacto de Axis (que se busca por teléfono).
// Sin dependencias de Node: corre igual en el servidor y en el navegador, para recalcular al editar.
import { normalizeFolio, sanitizeInput, splitTelefono, type SheetFields } from "./fields";

export const CAMPOS_COMPARABLES = ["nombre", "correo"] as const;
export type CampoComparable = (typeof CAMPOS_COMPARABLES)[number];

/** ok: coincide · distinto: no coincide (o falta en la hoja) · sin_dato: Axis no tiene ese dato. */
export type EstadoCampo = "ok" | "distinto" | "sin_dato";
export type Conciliacion = Record<CampoComparable, EstadoCampo>;

/** Lo que se usa de un contacto de Axis; "" si Axis no tiene el dato. */
export interface ContactoAxis {
  nombre: string;
  correo: string;
  telefono?: string;
}

/**
 * Respuesta de la búsqueda de un teléfono en Axis (la misma forma en servidor y navegador).
 * no_configurado: aún no hay endpoint/token; la interfaz no muestra nada.
 * no_disponible: Axis no respondió o respondió algo inesperado.
 */
export type ResultadoAxis =
  | { estado: "encontrado"; contacto: ContactoAxis; coincidencias: number }
  | { estado: "no_encontrado" }
  | { estado: "no_disponible" }
  | { estado: "no_configurado" };

/** Sin acentos, mayúsculas, signos ni espacios de más: "MARÍA-José  Pérez" → "maria jose perez". */
export function normalizarNombre(v: string): string {
  return v.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function normalizarCorreo(v: string): string {
  return v.replace(/\s+/g, "").toLowerCase();
}

const NORMALIZAR: Record<CampoComparable, (v: string) => string> = {
  nombre: normalizarNombre,
  correo: normalizarCorreo,
};

export function conciliar(f: Pick<SheetFields, CampoComparable>, axis: ContactoAxis): Conciliacion {
  const estado = (campo: CampoComparable): EstadoCampo => {
    const referencia = NORMALIZAR[campo](axis[campo]);
    if (!referencia) return "sin_dato";
    return NORMALIZAR[campo](f[campo]) === referencia ? "ok" : "distinto";
  };
  return { nombre: estado("nombre"), correo: estado("correo") };
}

/** El dato de Axis tal como quedaría escrito en el campo (mismo filtro que al teclear). */
export function valorDeAxis(axis: ContactoAxis, campo: CampoComparable): string {
  return sanitizeInput(campo, axis[campo]).trim();
}

/** Los 10 dígitos con los que se consulta Axis, o null si el teléfono aún no está completo. */
export function telefonoConsultable(f: Pick<SheetFields, "lada" | "telefono">): string | null {
  const { telefono } = splitTelefono(f.lada, f.telefono);
  return /^\d{10}$/.test(telefono) ? telefono : null;
}

/**
 * Dos hojas son la misma ficha (otro pago de la misma persona) solo si coinciden folio, teléfono y nombre.
 * Si uno de los tres difiere, no se vinculan: el folio repetido se avisa como duplicado.
 */
export function mismaFicha(a: SheetFields, b: SheetFields): boolean {
  const folio = normalizeFolio(a.folio);
  return (
    !!folio &&
    folio === normalizeFolio(b.folio) &&
    `${a.lada}${a.telefono}` === `${b.lada}${b.telefono}` &&
    normalizarNombre(a.nombre) === normalizarNombre(b.nombre)
  );
}
