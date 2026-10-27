import { beforeEach, describe, expect, it, vi } from "vitest";

type Respuesta = { error: { code: string } | null };

const supabaseFalso = vi.hoisted(() => {
  const llamadas: { tabla: string; id: string }[] = [];
  const respuestas: { value: Respuesta[] } = { value: [] };
  const cliente = {
    from: (tabla: string) => ({
      delete: () => ({
        eq: async (_columna: string, id: string) => {
          llamadas.push({ tabla, id });
          return respuestas.value.shift() ?? { error: null };
        },
      }),
    }),
  };
  return { llamadas, respuestas, cliente };
});
vi.mock("@/lib/supabase", () => ({ supabase: supabaseFalso.cliente }));

import { eliminarEvento } from "./db";

const ok: Respuesta = { error: null };
const fkViolada: Respuesta = { error: { code: "23503" } };

beforeEach(() => {
  supabaseFalso.llamadas.length = 0;
  supabaseFalso.respuestas.value = [];
});

describe("eliminarEvento", () => {
  it("borra el evento directamente", async () => {
    supabaseFalso.respuestas.value = [ok];
    await eliminarEvento("e1");
    expect(supabaseFalso.llamadas).toEqual([{ tabla: "cap_eventos", id: "e1" }]);
  });

  it("si la relación de reaperturas lo impide, limpia las reaperturas y reintenta", async () => {
    supabaseFalso.respuestas.value = [fkViolada, ok, ok];
    await eliminarEvento("e1");
    expect(supabaseFalso.llamadas).toEqual([
      { tabla: "cap_eventos", id: "e1" },
      { tabla: "cap_eventos_reaperturas", id: "e1" },
      { tabla: "cap_eventos", id: "e1" },
    ]);
  });

  it("si tras limpiar sigue habiendo registros ligados en otra tabla, lo explica", async () => {
    supabaseFalso.respuestas.value = [fkViolada, ok, fkViolada];
    await expect(eliminarEvento("e1")).rejects.toMatchObject({ status: 409 });
  });

  it("un error distinto no se reintenta ni se esconde", async () => {
    supabaseFalso.respuestas.value = [{ error: { code: "XX000" } }];
    await expect(eliminarEvento("e1")).rejects.toMatchObject({ code: "XX000" });
    expect(supabaseFalso.llamadas).toHaveLength(1);
  });

  it("si falla la limpieza de reaperturas, el error llega a quien lo pidió", async () => {
    supabaseFalso.respuestas.value = [fkViolada, { error: { code: "XX000" } }];
    await expect(eliminarEvento("e1")).rejects.toMatchObject({ code: "XX000" });
    expect(supabaseFalso.llamadas).toHaveLength(2);
  });
});
