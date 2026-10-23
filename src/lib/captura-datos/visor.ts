// Geometría del visor de la hoja (sin React): cómo ampliar una zona y cómo convertir lo que se dibuja en un recuadro.
import type { Box } from "./fields";

export interface Tamano { w: number; h: number }
export interface Punto { x: number; y: number }
/** Posición y zoom de la imagen dentro de la vista (lo que maneja react-zoom-pan-pinch). */
export interface Transformacion { x: number; y: number; scale: number }

/** Zona de la hoja donde van los datos del cliente (folio, nombre, correo, celular): la parte de arriba. */
export const CAJA_DATOS: Box = { x: 0, y: 0, w: 0.7, h: 0.35 };

const MARGEN = 0.95; // deja un borde alrededor de la zona ampliada
const LADO_MINIMO = 0.02; // fracción mínima de la imagen para considerar que se dibujó un recuadro

/** Tamaño con el que se ve la imagen completa dentro de la vista (sin deformarla). */
export function ajustarImagen(natural: Tamano, vista: Tamano): Tamano {
  if (!natural.w || !natural.h || !vista.w || !vista.h) return { w: 0, h: 0 };
  const escala = Math.min(vista.w / natural.w, vista.h / natural.h);
  return { w: Math.round(natural.w * escala), h: Math.round(natural.h * escala) };
}

/** Mantiene la imagen dentro de la vista: sin huecos más allá de sus bordes y centrada si cabe completa en ese eje. */
function acotar(pos: number, imagen: number, vista: number, scale: number): number {
  const ancho = imagen * scale;
  return ancho <= vista ? (vista - ancho) / 2 : Math.min(0, Math.max(vista - ancho, pos));
}

/** Desplazamiento y zoom para que `caja` (0–1 sobre la imagen) llene la vista, sin salirse de los bordes de la hoja. */
export function transformParaCaja(caja: Box, imagen: Tamano, vista: Tamano, zoomMaximo: number): Transformacion {
  const scale = Math.max(1, Math.min(zoomMaximo, MARGEN * Math.min(vista.w / (caja.w * imagen.w), vista.h / (caja.h * imagen.h))));
  return {
    scale,
    x: acotar(vista.w / 2 - (caja.x + caja.w / 2) * imagen.w * scale, imagen.w, vista.w, scale),
    y: acotar(vista.h / 2 - (caja.y + caja.h / 2) * imagen.h * scale, imagen.h, vista.h, scale),
  };
}

const entre01 = (n: number) => Math.min(1, Math.max(0, n));

/** Recuadro (0–1 sobre la imagen) que forman dos puntos de la vista; null si es demasiado pequeño. */
export function cajaDesdePuntos(a: Punto, b: Punto, t: Transformacion, imagen: Tamano): Box | null {
  const aImagen = (p: Punto): Punto => ({ x: entre01((p.x - t.x) / t.scale / imagen.w), y: entre01((p.y - t.y) / t.scale / imagen.h) });
  const p = aImagen(a);
  const q = aImagen(b);
  const caja = { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(p.x - q.x), h: Math.abs(p.y - q.y) };
  return caja.w < LADO_MINIMO || caja.h < LADO_MINIMO ? null : caja;
}
