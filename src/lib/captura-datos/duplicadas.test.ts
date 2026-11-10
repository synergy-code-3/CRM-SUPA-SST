import { describe, expect, it } from "vitest";
import { grupoDuplicadas, sinVincular } from "./duplicadas";
import type { HojaCaptura } from "./modelo";

const hoja = (id: string, telefono: string, extra: Partial<HojaCaptura> = {}) =>
  ({ id, estatus: "Completo", estado: "leida", campos: { telefono }, origen: { nombreOriginal: `${id}.jpg` }, ...extra }) as unknown as HojaCaptura;

describe("grupoDuplicadas", () => {
  it("agrupa hojas del mismo estado con el mismo teléfono", () => {
    const hojas = [hoja("a", "3311111111"), hoja("b", "3311111111"), hoja("c", "3322222222"), hoja("d", "3311111111", { estatus: "Apartado" })];
    expect(grupoDuplicadas(hojas, hojas[0]).map((h) => h.id)).toEqual(["a", "b"]);
    expect(grupoDuplicadas(hojas, hojas[2])).toEqual([]);
  });

  it("ignora no válidas pero incluye secundarias", () => {
    const hojas = [hoja("a", "3311111111"), hoja("b", "3311111111", { estado: "no_valida" }), hoja("c", "3311111111", { estado: "no_valida", origen: { nombreOriginal: "c.jpg", principalId: "a" } })];
    const grupo = grupoDuplicadas(hojas, hojas[0]);
    expect(grupo.map((h) => h.id)).toEqual(["a", "c"]);
    expect(sinVincular(grupo)).toBe(false);
  });

  it("sin teléfono completo no hay grupo", () => {
    expect(grupoDuplicadas([hoja("a", "331"), hoja("b", "331")], hoja("a", "331"))).toEqual([]);
  });
});
