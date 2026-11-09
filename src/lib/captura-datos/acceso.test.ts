import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ usuarioAsignado: vi.fn(), obtenerHoja: vi.fn() }));
vi.mock("./db", () => db);

import { requerirEvento, requerirHoja } from "./acceso";
import { ErrorPeticion } from "./api";

const E1 = "11111111-1111-4111-8111-111111111111";
const H1 = "22222222-2222-4222-8222-222222222222";
const admin = { id: "a", nombre: "A", rol: "admin" as const };
const abeja = { id: "b", nombre: "B", rol: "abeja" as const };

beforeEach(() => vi.resetAllMocks());

describe("requerirEvento", () => {
  it("responde 404 si el id no es un uuid, sin consultar la base", async () => {
    await expect(requerirEvento(admin, "no-es-uuid")).rejects.toMatchObject({ status: 404 });
    await expect(requerirHoja(admin, "no-es-uuid")).rejects.toMatchObject({ status: 404 });
    expect(db.obtenerHoja).not.toHaveBeenCalled();
  });

  it("deja pasar a un admin sin consultar asignaciones", async () => {
    await expect(requerirEvento(admin, E1)).resolves.toBeUndefined();
    expect(db.usuarioAsignado).not.toHaveBeenCalled();
  });

  it("deja pasar a un usuario asignado al evento", async () => {
    db.usuarioAsignado.mockResolvedValue(true);
    await expect(requerirEvento(abeja, E1)).resolves.toBeUndefined();
    expect(db.usuarioAsignado).toHaveBeenCalledWith(E1, "b");
  });

  it("responde 404 (sin revelar que existe) a un usuario no asignado", async () => {
    db.usuarioAsignado.mockResolvedValue(false);
    await expect(requerirEvento(abeja, E1)).rejects.toMatchObject({ status: 404 });
    await expect(requerirEvento(abeja, E1)).rejects.toBeInstanceOf(ErrorPeticion);
  });
});

describe("requerirHoja", () => {
  it("404 si la hoja no existe", async () => {
    db.obtenerHoja.mockResolvedValue(null);
    await expect(requerirHoja(admin, H1)).rejects.toMatchObject({ status: 404 });
  });

  it("comprueba el acceso al evento de la hoja y la devuelve", async () => {
    const hoja = { id: H1, eventoId: E1 };
    db.obtenerHoja.mockResolvedValue(hoja);
    db.usuarioAsignado.mockResolvedValue(true);
    await expect(requerirHoja(abeja, H1)).resolves.toBe(hoja);
    expect(db.usuarioAsignado).toHaveBeenCalledWith(E1, "b");
  });

  it("404 si la hoja es de un evento al que no está asignado", async () => {
    db.obtenerHoja.mockResolvedValue({ id: H1, eventoId: E1 });
    db.usuarioAsignado.mockResolvedValue(false);
    await expect(requerirHoja(abeja, H1)).rejects.toMatchObject({ status: 404 });
  });
});
