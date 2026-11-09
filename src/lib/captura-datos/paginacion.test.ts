import { describe, expect, it } from "vitest";
import { paginar } from "./paginacion";

const nums = Array.from({ length: 40 }, (_, i) => i);

describe("paginar", () => {
  it("parte 40 elementos en 3 páginas de 15", () => {
    expect(paginar(nums, 0, 15)).toMatchObject({ pagina: 0, paginas: 3 });
    expect(paginar(nums, 2, 15).items).toEqual(nums.slice(30));
  });

  it("si la página se pasa del final, devuelve la última", () => {
    expect(paginar(nums, 9, 15).pagina).toBe(2);
  });

  it("sin elementos hay una página vacía", () => {
    expect(paginar([], 0, 15)).toEqual({ items: [], pagina: 0, paginas: 1 });
  });
});
