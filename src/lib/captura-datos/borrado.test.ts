import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  obtenerEvento: vi.fn(),
  crearSolicitudBorrado: vi.fn(),
  resolverSolicitudBorrado: vi.fn(),
  eliminarEvento: vi.fn(),
}));
vi.mock("./db", () => db);

import { esAprobadorBorrado, resolverBorrado, solicitarBorrado } from "./borrado";

const admin = { id: "a", nombre: "Ana", rol: "admin" as const };
const samuel = { id: "s", nombre: "  samuel otniel díaz gonzález ", rol: "admin" as const };
const coordinador = { id: "c", nombre: "Samuel Otniel Diaz Gonzalez", rol: "coordinador" as const };

beforeEach(() => vi.resetAllMocks());

describe("esAprobadorBorrado", () => {
  it("reconoce a Samuel ignorando mayúsculas, acentos y espacios", () => {
    expect(esAprobadorBorrado(samuel)).toBe(true);
  });
  it("rechaza a cualquier otra persona", () => {
    expect(esAprobadorBorrado(admin)).toBe(false);
  });
});

describe("esAprobadorBorrado (Alexis)", () => {
  it("reconoce a Alexis Osvaldo Villegas Ochoa y no a un homónimo parcial", () => {
    expect(esAprobadorBorrado({ nombre: "Alexis Osvaldo Villegas Ochoa" })).toBe(true);
    expect(esAprobadorBorrado({ nombre: "Alexis Villegas" })).toBe(false);
  });
});

describe("solicitarBorrado", () => {
  it("solo admin puede pedirlo", async () => {
    await expect(solicitarBorrado(coordinador, "e1", "x")).rejects.toMatchObject({ status: 403 });
  });
  it("exige motivo", async () => {
    await expect(solicitarBorrado(admin, "e1", "   ")).rejects.toMatchObject({ status: 400 });
    expect(db.crearSolicitudBorrado).not.toHaveBeenCalled();
  });
  it("404 si el evento no existe", async () => {
    db.obtenerEvento.mockResolvedValue(null);
    await expect(solicitarBorrado(admin, "e1", "duplicado")).rejects.toMatchObject({ status: 404 });
  });
  it("registra la solicitud sin borrar nada", async () => {
    db.obtenerEvento.mockResolvedValue({ id: "e1", nombre: "Evento" });
    await solicitarBorrado(admin, "e1", " duplicado ");
    expect(db.crearSolicitudBorrado).toHaveBeenCalledWith({ eventoId: "e1", eventoNombre: "Evento", motivo: "duplicado", solicitadaPorId: "a" });
    expect(db.eliminarEvento).not.toHaveBeenCalled();
  });
});

describe("resolverBorrado", () => {
  it("solo el aprobador puede resolver", async () => {
    await expect(resolverBorrado(admin, "r1", true)).rejects.toMatchObject({ status: 403 });
    expect(db.resolverSolicitudBorrado).not.toHaveBeenCalled();
  });
  it("aprobar borra el evento", async () => {
    db.resolverSolicitudBorrado.mockResolvedValue({ id: "r1", eventoId: "e1" });
    await resolverBorrado(samuel, "r1", true);
    expect(db.resolverSolicitudBorrado).toHaveBeenCalledWith("r1", "s", true);
    expect(db.eliminarEvento).toHaveBeenCalledWith("e1");
  });
  it("rechazar no borra nada", async () => {
    db.resolverSolicitudBorrado.mockResolvedValue({ id: "r1", eventoId: "e1" });
    await resolverBorrado(samuel, "r1", false);
    expect(db.eliminarEvento).not.toHaveBeenCalled();
  });
  it("404 si la solicitud ya no está pendiente", async () => {
    db.resolverSolicitudBorrado.mockResolvedValue(null);
    await expect(resolverBorrado(samuel, "r1", true)).rejects.toMatchObject({ status: 404 });
    expect(db.eliminarEvento).not.toHaveBeenCalled();
  });
});
