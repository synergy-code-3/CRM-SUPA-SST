import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { campos, consultaAxis, crearEvento, patchEvento, patchHoja } from "./validacion";
import { fechaDeHoy, idValido } from "./modelo";

// El tope de la fecha de un evento es "hoy": se fija el reloj para que las fechas de ejemplo (2026-11-15) no sean futuras.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-01T18:00:00Z"));
});
afterAll(() => vi.useRealTimers());

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const destino = { id: "1w1nhREInIc7NGezEPg3l_-q1f9mkvqSG", url: "https://drive.google.com/drive/folders/x", nombre: "Prueba" };

describe("esquemas de la API", () => {
  it("crearEvento acepta datos válidos y rechaza URLs que no son de Google", () => {
    expect(crearEvento.safeParse({ nombre: "", fecha: "2026-11-15", estatus: "Completo", destino, origen: "local" }).success).toBe(true);
    expect(crearEvento.safeParse({ nombre: "", fecha: "2026-11-15", estatus: "Completo", destino: { ...destino, url: "https://evil.com/x" }, origen: "local" }).success).toBe(false);
    expect(crearEvento.safeParse({ nombre: "", fecha: "2026-11-15", estatus: "Raro", destino, origen: "local" }).success).toBe(false);
  });

  it("crearEvento no acepta fechas anteriores a 2023", () => {
    const con = (fecha: string) => crearEvento.safeParse({ nombre: "", fecha, estatus: "Completo", destino, origen: "local" }).success;
    expect(con("2022-12-31")).toBe(false);
    expect(con("2019-05-10")).toBe(false);
    expect(con("2023-01-01")).toBe(true);
    expect(con("2026-11-15")).toBe(true);
  });

  it("crearEvento no acepta fechas futuras: el máximo es hoy", () => {
    const con = (fecha: string) => crearEvento.safeParse({ nombre: "", fecha, estatus: "Completo", destino, origen: "local" }).success;
    expect(con("2026-12-01")).toBe(true);
    expect(con("2026-12-02")).toBe(false);
    expect(con("2030-01-01")).toBe(false);
  });

  it("fechaDeHoy usa la hora de México (a las 03:00 UTC todavía es el día anterior)", () => {
    expect(fechaDeHoy(new Date("2026-12-01T03:00:00Z"))).toBe("2026-11-30");
    expect(fechaDeHoy(new Date("2026-12-01T12:00:00Z"))).toBe("2026-12-01");
  });

  it("crearEvento rechaza fechas que no existen o están mal escritas", () => {
    const con = (fecha: string) => crearEvento.safeParse({ nombre: "", fecha, estatus: "Completo", destino, origen: "local" }).success;
    expect(con("2026-02-30")).toBe(false);
    expect(con("2026-13-01")).toBe(false);
    expect(con("15/11/2026")).toBe(false);
    expect(con("")).toBe(false);
  });

  it("crearEvento rechaza ids de usuario que no son uuid", () => {
    expect(crearEvento.safeParse({ nombre: "", fecha: "2026-11-15", estatus: "Completo", destino, origen: "drive", usuariosAsignados: ["x"] }).success).toBe(false);
    expect(crearEvento.safeParse({ nombre: "", fecha: "2026-11-15", estatus: "Completo", destino, origen: "drive", usuariosAsignados: [UUID] }).success).toBe(true);
  });

  it("campos rellena valores por defecto y limita la lada", () => {
    expect(campos.parse({}).lada).toBe("+52");
    expect(campos.safeParse({ lada: "+34" }).success).toBe(false);
  });

  it("patchHoja acota el recuadro del voucher a 0–1", () => {
    const r = patchHoja.parse({ voucherBox: { x: -1, y: 2, w: 0.5, h: 0.5 } });
    expect(r.voucherBox).toEqual({ x: 0, y: 1, w: 0.5, h: 0.5 });
  });

  it("patchEvento y consultaAxis", () => {
    expect(patchEvento.safeParse({ accion: "borrar" }).success).toBe(false);
    expect(consultaAxis.safeParse({ telefono: "3312345678" }).success).toBe(true);
    expect(consultaAxis.safeParse({ telefono: "33123" }).success).toBe(false);
  });

  it("idValido solo deja pasar uuid", () => {
    expect(idValido(UUID)).toBe(UUID);
    expect(() => idValido("../etc")).toThrow();
    expect(() => idValido(null)).toThrow();
  });
});
