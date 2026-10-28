import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  obtenerEvento: vi.fn(),
  eliminarEvento: vi.fn(),
  listarHojasDeEvento: vi.fn(),
}));
vi.mock("./db", () => db);

const auditoria = vi.hoisted(() => ({ registrarAuditoria: vi.fn() }));
vi.mock("./auditoria", () => auditoria);

import { borrarEventoDirecto } from "./borrado";

const admin = { id: "a", nombre: "Ana", rol: "admin" as const };
const coordinador = { id: "c", nombre: "Carlos", rol: "coordinador" as const };

beforeEach(() => vi.resetAllMocks());

describe("borrarEventoDirecto", () => {
  it("solo admin", async () => {
    await expect(borrarEventoDirecto(coordinador, "e1", "x")).rejects.toMatchObject({ status: 403 });
    expect(db.eliminarEvento).not.toHaveBeenCalled();
  });
  it("exige motivo", async () => {
    await expect(borrarEventoDirecto(admin, "e1", " ")).rejects.toMatchObject({ status: 400 });
    expect(db.eliminarEvento).not.toHaveBeenCalled();
  });
  it("borra el evento directamente", async () => {
    db.obtenerEvento.mockResolvedValue({ id: "e1", nombre: "Evento" });
    db.listarHojasDeEvento.mockResolvedValue([]);
    await borrarEventoDirecto(admin, "e1", " duplicado ");
    expect(db.eliminarEvento).toHaveBeenCalledWith("e1");
  });
  it("deja en el historial quién lo borró, el motivo y cuántas hojas tenía", async () => {
    db.obtenerEvento.mockResolvedValue({ id: "e1", nombre: "Evento", fecha: "2026-10-28" });
    db.listarHojasDeEvento.mockResolvedValue([{ estado: "confirmada" }, { estado: "confirmada" }, { estado: "pendiente" }]);
    await borrarEventoDirecto(admin, "e1", " duplicado ");
    expect(auditoria.registrarAuditoria).toHaveBeenCalledWith({
      usuario: admin,
      accion: "evento_borrado",
      eventoId: "e1",
      eventoNombre: "Evento",
      detalle: { motivo: "duplicado", fecha: "2026-10-28", hojas: 3, confirmadas: 2 },
    });
  });
  it("no registra el borrado si el borrado falló", async () => {
    db.obtenerEvento.mockResolvedValue({ id: "e1", nombre: "Evento" });
    db.listarHojasDeEvento.mockResolvedValue([]);
    db.eliminarEvento.mockRejectedValue(new Error("db"));
    await expect(borrarEventoDirecto(admin, "e1", "x")).rejects.toThrow("db");
    expect(auditoria.registrarAuditoria).not.toHaveBeenCalled();
  });
  it("si el evento no existe, responde 404 y no borra", async () => {
    db.obtenerEvento.mockResolvedValue(null);
    await expect(borrarEventoDirecto(admin, "e1", "x")).rejects.toMatchObject({ status: 404 });
    expect(db.eliminarEvento).not.toHaveBeenCalled();
  });
});
