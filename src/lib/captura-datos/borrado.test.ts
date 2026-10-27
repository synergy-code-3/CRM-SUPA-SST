import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  obtenerEvento: vi.fn(),
  eliminarEvento: vi.fn(),
}));
vi.mock("./db", () => db);

import { borrarEventoDirecto } from "./borrado";

const admin = { id: "a", nombre: "Ana", rol: "admin" as const };
const coordinador = { id: "c", nombre: "Carlos", rol: "coordinador" as const };
const abeja = { id: "b", nombre: "Bea", rol: "abeja" as const };

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
    await borrarEventoDirecto(admin, "e1", " duplicado ");
    expect(db.eliminarEvento).toHaveBeenCalledWith("e1");
  });
  it("si el evento no existe, responde 404 y no borra", async () => {
    db.obtenerEvento.mockResolvedValue(null);
    await expect(borrarEventoDirecto(admin, "e1", "x")).rejects.toMatchObject({ status: 404 });
    expect(db.eliminarEvento).not.toHaveBeenCalled();
  });
  it("si falla el borrado, el error llega a quien lo pidió", async () => {
    db.obtenerEvento.mockResolvedValue({ id: "e1", nombre: "Evento" });
    db.eliminarEvento.mockRejectedValue(new Error("db"));
    await expect(borrarEventoDirecto(admin, "e1", "x")).rejects.toThrow("db");
  });
});
