import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  obtenerEvento: vi.fn(),
  crearSolicitudBorrado: vi.fn(),
  registrarBorradoDirecto: vi.fn(),
  resolverSolicitudBorrado: vi.fn(),
  eliminarEvento: vi.fn(),
}));
vi.mock("./db", () => db);

import { borrarEventoDirecto, esAprobadorBorrado, resolverBorrado, solicitarBorrado } from "./borrado";

const admin = { id: "a", nombre: "Ana", rol: "admin" as const };
const coordinador = { id: "c", nombre: "Carlos", rol: "coordinador" as const };
const abeja = { id: "b", nombre: "Bea", rol: "abeja" as const };

beforeEach(() => vi.resetAllMocks());

describe("esAprobadorBorrado", () => {
  it("cualquier admin puede aprobar", () => {
    expect(esAprobadorBorrado(admin)).toBe(true);
  });
  it("los demás roles no", () => {
    expect(esAprobadorBorrado(coordinador)).toBe(false);
    expect(esAprobadorBorrado(abeja)).toBe(false);
  });
});

describe("solicitarBorrado", () => {
  it("exige motivo", async () => {
    await expect(solicitarBorrado(abeja, "e1", "   ")).rejects.toMatchObject({ status: 400 });
    expect(db.crearSolicitudBorrado).not.toHaveBeenCalled();
  });
  it("404 si el evento no existe", async () => {
    db.obtenerEvento.mockResolvedValue(null);
    await expect(solicitarBorrado(abeja, "e1", "duplicado")).rejects.toMatchObject({ status: 404 });
  });
  it("registra la solicitud sin borrar nada", async () => {
    db.obtenerEvento.mockResolvedValue({ id: "e1", nombre: "Evento" });
    await solicitarBorrado(abeja, "e1", " duplicado ");
    expect(db.crearSolicitudBorrado).toHaveBeenCalledWith({ eventoId: "e1", eventoNombre: "Evento", motivo: "duplicado", solicitadaPorId: "b" });
    expect(db.eliminarEvento).not.toHaveBeenCalled();
  });
});

describe("borrarEventoDirecto", () => {
  it("solo admin", async () => {
    await expect(borrarEventoDirecto(coordinador, "e1", "x")).rejects.toMatchObject({ status: 403 });
    expect(db.eliminarEvento).not.toHaveBeenCalled();
  });
  it("exige motivo", async () => {
    await expect(borrarEventoDirecto(admin, "e1", " ")).rejects.toMatchObject({ status: 400 });
    expect(db.eliminarEvento).not.toHaveBeenCalled();
  });
  it("registra en el historial y borra", async () => {
    db.obtenerEvento.mockResolvedValue({ id: "e1", nombre: "Evento" });
    await borrarEventoDirecto(admin, "e1", " duplicado ");
    expect(db.registrarBorradoDirecto).toHaveBeenCalledWith({ eventoId: "e1", eventoNombre: "Evento", motivo: "duplicado", adminId: "a" });
    expect(db.eliminarEvento).toHaveBeenCalledWith("e1");
  });
  it("si no se pudo registrar el historial, no borra", async () => {
    db.obtenerEvento.mockResolvedValue({ id: "e1", nombre: "Evento" });
    db.registrarBorradoDirecto.mockRejectedValue(new Error("db"));
    await expect(borrarEventoDirecto(admin, "e1", "x")).rejects.toThrow("db");
    expect(db.eliminarEvento).not.toHaveBeenCalled();
  });
});

describe("resolverBorrado", () => {
  it("solo un admin puede resolver", async () => {
    await expect(resolverBorrado(coordinador, "r1", true)).rejects.toMatchObject({ status: 403 });
    expect(db.resolverSolicitudBorrado).not.toHaveBeenCalled();
  });
  it("aprobar borra el evento", async () => {
    db.resolverSolicitudBorrado.mockResolvedValue({ id: "r1", eventoId: "e1" });
    await resolverBorrado(admin, "r1", true);
    expect(db.resolverSolicitudBorrado).toHaveBeenCalledWith("r1", "a", true);
    expect(db.eliminarEvento).toHaveBeenCalledWith("e1");
  });
  it("rechazar no borra nada", async () => {
    db.resolverSolicitudBorrado.mockResolvedValue({ id: "r1", eventoId: "e1" });
    await resolverBorrado(admin, "r1", false);
    expect(db.eliminarEvento).not.toHaveBeenCalled();
  });
  it("404 si la solicitud ya no está pendiente", async () => {
    db.resolverSolicitudBorrado.mockResolvedValue(null);
    await expect(resolverBorrado(admin, "r1", true)).rejects.toMatchObject({ status: 404 });
    expect(db.eliminarEvento).not.toHaveBeenCalled();
  });
});
