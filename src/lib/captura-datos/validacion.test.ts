import { describe, expect, it } from "vitest";
import { campos, consultaAxis, crearEvento, patchEvento, patchHoja } from "./validacion";
import { idValido } from "./modelo";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const destino = { id: "1w1nhREInIc7NGezEPg3l_-q1f9mkvqSG", url: "https://drive.google.com/drive/folders/x", nombre: "Prueba" };

describe("esquemas de la API", () => {
  it("crearEvento acepta datos válidos y rechaza URLs que no son de Google", () => {
    expect(crearEvento.safeParse({ nombre: "", estatus: "Completo", destino, origen: "local" }).success).toBe(true);
    expect(crearEvento.safeParse({ nombre: "", estatus: "Completo", destino: { ...destino, url: "https://evil.com/x" }, origen: "local" }).success).toBe(false);
    expect(crearEvento.safeParse({ nombre: "", estatus: "Raro", destino, origen: "local" }).success).toBe(false);
  });

  it("crearEvento rechaza ids de usuario que no son uuid", () => {
    expect(crearEvento.safeParse({ nombre: "", estatus: "Completo", destino, origen: "drive", usuariosAsignados: ["x"] }).success).toBe(false);
    expect(crearEvento.safeParse({ nombre: "", estatus: "Completo", destino, origen: "drive", usuariosAsignados: [UUID] }).success).toBe(true);
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
