import { describe, expect, it } from "vitest";
import { bloqueadaPorOtra, bloqueoVigente, iniciales, misHojasEnEdicion, progresoPorPersona } from "./colaboracion";
import type { HojaCaptura } from "./modelo";

const AHORA = new Date("2026-11-02T12:00:00.000Z");
const FUTURO = "2026-11-02T12:05:00.000Z";
const PASADO = "2026-11-02T11:55:00.000Z";

const hoja = (parcial: Partial<HojaCaptura>): HojaCaptura => ({
  id: "h", eventoId: "e", estatus: "Completo", origen: { nombreOriginal: "a.jpg" }, estado: "pendiente",
  bloqueadaPorId: null, bloqueadaHasta: null, campos: null, voucherBox: null, adjuntas: [],
  confirmadaPorId: null, confirmadaEn: null, folio: null, version: 1, ...parcial,
});

describe("bloqueoVigente", () => {
  it("es true solo si el bloqueo no ha vencido", () => {
    expect(bloqueoVigente(hoja({ bloqueadaPorId: "u", bloqueadaHasta: FUTURO }), AHORA)).toBe(true);
    expect(bloqueoVigente(hoja({ bloqueadaPorId: "u", bloqueadaHasta: PASADO }), AHORA)).toBe(false);
    expect(bloqueoVigente(hoja({}), AHORA)).toBe(false);
  });

  it("una hoja confirmada con bloqueo vigente está en corrección (confirmar y no válida ya limpian el bloqueo)", () => {
    expect(bloqueoVigente(hoja({ estado: "confirmada", bloqueadaPorId: "u", bloqueadaHasta: FUTURO }), AHORA)).toBe(true);
    expect(bloqueoVigente(hoja({ estado: "confirmada" }), AHORA)).toBe(false);
  });
});

describe("iniciales", () => {
  it("toma la primera letra de las dos primeras palabras", () => {
    expect(iniciales("marco antonio pérez")).toBe("MA");
    expect(iniciales("  Ana ")).toBe("A");
    expect(iniciales("")).toBe("?");
  });
});

describe("misHojasEnEdicion", () => {
  it("cuenta solo los bloqueos vigentes de la persona", () => {
    const hojas = [
      hoja({ id: "1", bloqueadaPorId: "yo", bloqueadaHasta: FUTURO }),
      hoja({ id: "2", bloqueadaPorId: "yo", bloqueadaHasta: PASADO }),
      hoja({ id: "3", bloqueadaPorId: "otro", bloqueadaHasta: FUTURO }),
    ];
    expect(misHojasEnEdicion(hojas, "yo", AHORA)).toBe(1);
  });
});

describe("progresoPorPersona", () => {
  it("separa lo confirmado por ti, por cada otra persona y lo pendiente", () => {
    const hojas = [
      hoja({ estado: "confirmada", confirmadaPorId: "yo" }),
      hoja({ estado: "confirmada", confirmadaPorId: "yo" }),
      hoja({ estado: "confirmada", confirmadaPorId: "marco" }),
      hoja({ estado: "pendiente" }),
      hoja({ estado: "leida" }),
      hoja({ estado: "no_valida" }),
    ];
    expect(progresoPorPersona(hojas, "yo", { marco: "Marco" })).toEqual({
      tuyas: 2,
      otras: [{ id: "marco", nombre: "Marco", confirmadas: 1 }],
      pendientes: 2,
    });
  });

  it("ordena a las demás personas por más confirmadas y nombra 'Otra persona' si falta el nombre", () => {
    const hojas = [
      hoja({ estado: "confirmada", confirmadaPorId: "a" }),
      hoja({ estado: "confirmada", confirmadaPorId: "b" }),
      hoja({ estado: "confirmada", confirmadaPorId: "b" }),
    ];
    expect(progresoPorPersona(hojas, "yo", { a: "Ana" }).otras).toEqual([
      { id: "b", nombre: "Otra persona", confirmadas: 2 },
      { id: "a", nombre: "Ana", confirmadas: 1 },
    ]);
  });
});

describe("bloqueadaPorOtra", () => {
  it("es true solo si otra persona tiene un bloqueo vigente", () => {
    expect(bloqueadaPorOtra(hoja({ bloqueadaPorId: "otra", bloqueadaHasta: FUTURO }), "yo", AHORA)).toBe(true);
    expect(bloqueadaPorOtra(hoja({ bloqueadaPorId: "yo", bloqueadaHasta: FUTURO }), "yo", AHORA)).toBe(false);
    expect(bloqueadaPorOtra(hoja({ bloqueadaPorId: "otra", bloqueadaHasta: PASADO }), "yo", AHORA)).toBe(false);
    expect(bloqueadaPorOtra(hoja({}), "yo", AHORA)).toBe(false);
  });

  it("también cuenta en una hoja confirmada que otra persona está corrigiendo", () => {
    expect(bloqueadaPorOtra(hoja({ estado: "confirmada", bloqueadaPorId: "otra", bloqueadaHasta: FUTURO }), "yo", AHORA)).toBe(true);
  });
});
