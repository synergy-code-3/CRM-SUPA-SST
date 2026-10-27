import { beforeEach, describe, expect, it, vi } from "vitest";

type Error_ = { code: string } | null;

const supabaseFalso = vi.hoisted(() => {
  const estado: { errorEvento: Error_; errorAsignaciones: Error_; asignaciones: unknown[] } = { errorEvento: null, errorAsignaciones: null, asignaciones: [] };
  const fila = { id: "e1", nombre: "Evento", fecha: "2026-10-27", destino: "drive", origen: "local", carpeta_fotos_id: null, estado: "abierto", drive: null, creado_por: "u1", creado_en: "", confirmado_por: null, confirmado_en: null };
  const cliente = {
    from: (tabla: string) => ({
      insert: (valores: unknown) => {
        if (tabla === "cap_evento_asignaciones") {
          estado.asignaciones = valores as unknown[];
          return Promise.resolve({ error: estado.errorAsignaciones });
        }
        return { select: () => ({ single: async () => (estado.errorEvento ? { data: null, error: estado.errorEvento } : { data: fila, error: null }) }) };
      },
    }),
  };
  return { estado, cliente };
});
vi.mock("@/lib/supabase", () => ({ supabase: supabaseFalso.cliente }));

import { crearEvento } from "./db";

const entrada = { nombre: "Evento", fecha: "2026-10-27", destino: "drive" as never, origen: "local" as const, creadoPorId: "u1", usuariosAsignados: ["u2", "u1"] };

beforeEach(() => {
  supabaseFalso.estado.errorEvento = null;
  supabaseFalso.estado.errorAsignaciones = null;
  supabaseFalso.estado.asignaciones = [];
});

describe("crearEvento", () => {
  it("crea el evento y asigna a quien lo crea y a los demás sin duplicar", async () => {
    const evento = await crearEvento(entrada);
    expect(evento).toMatchObject({ id: "e1", nombre: "Evento", fecha: "2026-10-27" });
    expect(supabaseFalso.estado.asignaciones).toEqual([
      { evento_id: "e1", usuario_id: "u1" },
      { evento_id: "e1", usuario_id: "u2" },
    ]);
  });

  it.each(["PGRST204", "42703"])("si falta la columna fecha (%s), explica qué SQL correr", async (codigo) => {
    supabaseFalso.estado.errorEvento = { code: codigo };
    await expect(crearEvento(entrada)).rejects.toMatchObject({ status: 503, message: expect.stringContaining("captura-datos-fecha-orden.sql") });
  });

  it("otro error de la base no se esconde", async () => {
    supabaseFalso.estado.errorEvento = { code: "XX000" };
    await expect(crearEvento(entrada)).rejects.toMatchObject({ code: "XX000" });
  });
});
