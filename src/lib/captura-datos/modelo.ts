// Modelo de datos de Captura de Datos. Sin dependencias de servidor: lo usan
// las rutas, db.ts y los componentes del navegador.
//
// A diferencia del proyecto original ("Escaner de hojas", un solo operador,
// todo vivía en un único "Escaneo" con su array de "registros" guardado como
// JSON en disco), aquí cada evento y cada hoja son su propia fila en
// Supabase (cap_eventos / cap_hojas) para que varias personas trabajen el
// mismo evento en paralelo. Los tipos de abajo reflejan esas tablas.
import type { Box, Estatus, SheetFields } from "./fields";

const ID_RE = /^[0-9a-f-]{36}$/;

export function idValido(id: string | null | undefined): string {
  if (!id || !ID_RE.test(id)) throw new Error("Identificador inválido");
  return id;
}

export interface Destino {
  id: string;
  url: string;
  nombre: string;
}

export interface FotoRef {
  nombreOriginal: string; // archivo de origen (p. ej. IMG_1234.jpg o lista.pdf)
  driveId?: string; // archivo en Drive (la foto o el PDF), si ya está allá
  rutaStorage?: string; // ruta en el bucket cap-fotos (fotos viejas subidas antes de ir directo a Drive)
  nombreDrive?: string; // nombre actual del archivo en Drive, solo si lo subió la app (esos se renombran con folio y nombre)
  pagina?: number; // página del PDF (1-based)
  paginas?: number;
  w?: number;
  h?: number;
  leidaIa?: boolean; // ya se usó "Leer con IA" en esta hoja: solo se permite una vez
  leidaIaDesde?: string; // ISO: la lectura se reclamó pero aún no termina; pasado LEASE_LECTURA_IA_MS se considera abandonada
}

/**
 * Otra imagen de la misma ficha (mismo folio, otro comprobante de pago). Solo se ve: no tiene fila propia en el
 * Excel ni en la Hoja, y `fields` es una copia de lo leído para poder mostrarla.
 */
export interface Adjunta {
  id: string;
  fields: SheetFields;
  foto: FotoRef;
  voucherBox?: Box | null;
  confirmadoPor?: string;
  confirmadoEn?: string;
}

export type EstadoEvento = "abierto" | "confirmado";
export type EstadoHoja = "pendiente" | "leida" | "confirmada" | "no_valida";
export type OrigenEvento = "drive" | "local";

/** Primer día permitido para la fecha de un evento (YYYY-MM-DD): no se crean eventos de antes de 2023. */
export const FECHA_MINIMA_EVENTO = "2023-01-01";

export interface EventoCaptura {
  id: string;
  nombre: string;
  fecha: string | null; // fecha del evento (YYYY-MM-DD)
  destino: Destino;
  origen: OrigenEvento;
  carpetaFotosId: string | null; // subcarpeta de Drive (Completos/…) donde van las fotos subidas desde la computadora
  estado: EstadoEvento;
  drive: { hojaId: string; hojaUrl: string; filas: number; gid?: number } | null;
  creadoPorId: string | null;
  creadoEn: string;
  confirmadoPorId: string | null;
  confirmadoEn: string | null;
}

export interface HojaCaptura {
  id: string;
  eventoId: string;
  estatus: Estatus;
  origen: FotoRef;
  estado: EstadoHoja;
  bloqueadaPorId: string | null;
  bloqueadaHasta: string | null;
  campos: SheetFields | null;
  voucherBox: Box | null;
  adjuntas: Adjunta[];
  confirmadaPorId: string | null;
  confirmadaEn: string | null;
  folio: string | null;
  version: number;
}
