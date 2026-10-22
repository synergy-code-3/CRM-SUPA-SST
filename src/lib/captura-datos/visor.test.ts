import { describe, expect, it } from "vitest";
import { ajustarImagen, cajaDesdePuntos, transformParaCaja } from "./visor";

describe("ajustarImagen", () => {
  it("encaja la imagen dentro de la vista sin deformarla", () => {
    expect(ajustarImagen({ w: 2000, h: 1000 }, { w: 500, h: 500 })).toEqual({ w: 500, h: 250 });
    expect(ajustarImagen({ w: 1000, h: 2000 }, { w: 500, h: 500 })).toEqual({ w: 250, h: 500 });
  });
  it("devuelve 0×0 si aún no se conoce el tamaño", () => {
    expect(ajustarImagen({ w: 0, h: 0 }, { w: 500, h: 500 })).toEqual({ w: 0, h: 0 });
  });
});

describe("transformParaCaja", () => {
  const imagen = { w: 400, h: 400 };
  const vista = { w: 400, h: 400 };

  it("nunca reduce por debajo del tamaño de la hoja completa", () => {
    expect(transformParaCaja({ x: 0, y: 0, w: 1, h: 1 }, imagen, vista, 8).scale).toBe(1);
  });
  it("centra la caja en la vista cuando no toca los bordes de la hoja", () => {
    const t = transformParaCaja({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, imagen, vista, 8);
    expect((0.5 * 400) * t.scale + t.x).toBeCloseTo(200, 1);
    expect((0.5 * 400) * t.scale + t.y).toBeCloseTo(200, 1);
  });
  it("no deja ver más allá de los bordes de la hoja", () => {
    const t = transformParaCaja({ x: 0, y: 0, w: 0.4, h: 0.4 }, imagen, vista, 8);
    expect(t.x).toBe(0);
    expect(t.y).toBe(0);
    const u = transformParaCaja({ x: 0.6, y: 0.6, w: 0.4, h: 0.4 }, imagen, vista, 8);
    expect(u.x).toBeCloseTo(400 - 400 * u.scale, 5);
    expect(u.y).toBeCloseTo(400 - 400 * u.scale, 5);
  });
  it("centra la hoja en el eje donde cabe completa", () => {
    const t = transformParaCaja({ x: 0, y: 0, w: 1, h: 1 }, { w: 400, h: 200 }, { w: 400, h: 400 }, 8);
    expect(t.y).toBe(100);
  });
  it("respeta el zoom máximo", () => {
    expect(transformParaCaja({ x: 0.4, y: 0.4, w: 0.01, h: 0.01 }, imagen, vista, 4).scale).toBe(4);
  });
});

describe("cajaDesdePuntos", () => {
  const imagen = { w: 400, h: 400 };
  const sinZoom = { x: 0, y: 0, scale: 1 };

  it("convierte dos puntos de pantalla en un recuadro normalizado (en cualquier dirección)", () => {
    expect(cajaDesdePuntos({ x: 100, y: 200 }, { x: 200, y: 100 }, sinZoom, imagen)).toEqual({ x: 0.25, y: 0.25, w: 0.25, h: 0.25 });
  });
  it("descuenta el desplazamiento y el zoom actuales", () => {
    const t = { x: -100, y: 0, scale: 2 };
    expect(cajaDesdePuntos({ x: 100, y: 0 }, { x: 300, y: 200 }, t, imagen)).toEqual({ x: 0.25, y: 0, w: 0.25, h: 0.25 });
  });
  it("recorta a los bordes de la imagen", () => {
    const c = cajaDesdePuntos({ x: -50, y: -50 }, { x: 600, y: 200 }, sinZoom, imagen)!;
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
    expect(c.w).toBe(1);
  });
  it("ignora recuadros demasiado pequeños (un clic)", () => {
    expect(cajaDesdePuntos({ x: 10, y: 10 }, { x: 12, y: 12 }, sinZoom, imagen)).toBeNull();
  });
});
