import { describe, expect, it } from "vitest";
import { estaCompleto } from "./cierre";

describe("estaCompleto", () => {
  it("es true cuando todas las hojas están confirmadas", () => {
    expect(estaCompleto(["confirmada", "confirmada"])).toBe(true);
  });

  it("ignora las hojas no válidas", () => {
    expect(estaCompleto(["confirmada", "no_valida"])).toBe(true);
  });

  it("es false si queda alguna pendiente o leída", () => {
    expect(estaCompleto(["confirmada", "pendiente"])).toBe(false);
    expect(estaCompleto(["confirmada", "leida"])).toBe(false);
  });

  it("es false sin hojas o sin ninguna confirmada", () => {
    expect(estaCompleto([])).toBe(false);
    expect(estaCompleto(["no_valida"])).toBe(false);
  });
});
