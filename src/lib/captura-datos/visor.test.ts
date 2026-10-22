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
  it("centra la caja en la vista al ampliarla", () => {
    const t = transformParaCaja({ x: 0.5, y: 0, w: 0.5, h: 0.5 }, imagen, vista, 8);
    const centroX = (0.75 * 400) * t.scale + t.x;
    const centroY = (0.25 * 400) * t.scale + t.y;
    expect(centroX).toBeCloseTo(200, 1);
    expect(centroY).toBeCloseTo(200, 1);
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
