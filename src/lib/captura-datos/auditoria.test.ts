import { beforeEach, describe, expect, it, vi } from "vitest";

type Respuesta = { data?: unknown; error?: unknown };
type Operacion = [string, unknown[]];

// Supabase simulado: cada consulta registra sus operaciones y, al esperarla, responde lo configurado para su tabla.
const mock = vi.hoisted(() => {
  const consultas: { tabla: string; operaciones: [string, unknown[]][] }[] = [];
  const respuestas: Record<string, Respuesta> = {};
  const cliente = {
    from(tabla: string) {
      const consulta = { tabla, operaciones: [] as [string, unknown[]][] };
      consultas.push(consulta);
      const constructor: Record<string, unknown> = new Proxy({}, {
        get(_objetivo, propiedad: string) {
          if (propiedad === "then") {
            return (resolver: (v: unknown) => unknown, rechazar: (e: unknown) => unknown) =>
              Promise.resolve(respuestas[tabla] ?? { data: null, error: null }).then(resolver, rechazar);
          }
          return (...args: unknown[]) => {
            consulta.operaciones.push([propiedad, args]);
            return constructor;
          };
        },
      });
      return constructor;
    },
  };
  return { consultas, respuestas, cliente };
});
vi.mock("@/lib/supabase", () => ({ supabase: mock.cliente }));

import { listarAuditoria, purgarAuditoria, registrarAuditoria, registrarConfirmacionDeHoja } from "./auditoria";
import { EMPTY_FIELDS, type SheetFields } from "./fields";
import type { HojaCaptura } from "./modelo";

const usuario = { id: "u1", nombre: "Ana" };
const campos = (sobreescribir: Partial<SheetFields> = {}): SheetFields => ({ ...EMPTY_FIELDS, folio: "4476", nombre: "Ana Pérez", ...sobreescribir });

function hoja(estado: HojaCaptura["estado"], c: SheetFields | null): HojaCaptura {
  return { id: "h1", eventoId: "e1", estatus: "Completo", origen: { nombreOriginal: "a.jpg" }, estado, bloqueadaPorId: null, bloqueadaHasta: null, campos: c, voucherBox: null, adjuntas: [], confirmadaPorId: null, confirmadaEn: null, folio: c?.folio ?? null, version: 1 };
}

/** Lo que se insertó en cap_auditoria (la primera consulta que lo hizo). */
function insertado(): Record<string, unknown> | undefined {
  const consulta = mock.consultas.find((c) => c.tabla === "cap_auditoria" && c.operaciones.some(([m]) => m === "insert"));
  return consulta?.operaciones.find(([m]) => m === "insert")?.[1][0] as Record<string, unknown> | undefined;
}

const operacionesDe = (tabla: string): Operacion[] => mock.consultas.filter((c) => c.tabla === tabla).flatMap((c) => c.operaciones);

beforeEach(() => {
  mock.consultas.length = 0;
  for (const k of Object.keys(mock.respuestas)) delete mock.respuestas[k];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("registrarAuditoria", () => {
  it("guarda quién, qué y sobre qué evento", async () => {
    await registrarAuditoria({ usuario, accion: "evento_creado", eventoId: "e1", eventoNombre: "Evento", detalle: { fecha: "2026-10-28" } });
    expect(insertado()).toEqual({
      usuario_id: "u1", usuario_nombre: "Ana", evento_id: "e1", evento_nombre: "Evento", hoja_id: null, accion: "evento_creado", detalle: { fecha: "2026-10-28" },
    });
  });

  it("si no se indica el nombre del evento, lo busca por su id", async () => {
    mock.respuestas.cap_eventos = { data: { nombre: "Evento del sábado" }, error: null };
    await registrarAuditoria({ usuario, accion: "evento_cerrado", eventoId: "e1" });
    expect(insertado()?.evento_nombre).toBe("Evento del sábado");
  });

  it("si falla el guardado, no lanza: lo anota en la consola y sigue", async () => {
    mock.respuestas.cap_auditoria = { error: { code: "42P01" } };
    await expect(registrarAuditoria({ usuario, accion: "evento_cerrado", eventoId: "e1", eventoNombre: "E" })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("registrarConfirmacionDeHoja", () => {
  it("la primera confirmación guarda solo el folio, sin datos personales", async () => {
    await registrarConfirmacionDeHoja({ usuario, previa: hoja("leida", campos()), hoja: hoja("confirmada", campos()), duplicadoForzado: false });
    const fila = insertado();
    expect(fila).toMatchObject({ accion: "hoja_confirmada", hoja_id: "h1", evento_id: "e1", detalle: { folio: "4476" } });
    expect(JSON.stringify(fila?.detalle)).not.toContain("Ana");
  });

  it("marca cuando se confirmó forzando un folio duplicado", async () => {
    await registrarConfirmacionDeHoja({ usuario, previa: hoja("leida", campos()), hoja: hoja("confirmada", campos()), duplicadoForzado: true });
    expect(insertado()?.detalle).toEqual({ folio: "4476", duplicadoForzado: true });
  });

  it("corregir una hoja ya confirmada guarda los campos que cambiaron", async () => {
    await registrarConfirmacionDeHoja({ usuario, previa: hoja("confirmada", campos()), hoja: hoja("confirmada", campos({ telefono: "3322222222" })), duplicadoForzado: false });
    expect(insertado()).toMatchObject({ accion: "hoja_corregida", detalle: { folio: "4476", cambios: { telefono: { antes: "", despues: "3322222222" } } } });
  });

  it("si al corregir no cambió nada, no registra nada", async () => {
    await registrarConfirmacionDeHoja({ usuario, previa: hoja("confirmada", campos()), hoja: hoja("confirmada", campos()), duplicadoForzado: false });
    expect(insertado()).toBeUndefined();
  });
});

describe("listarAuditoria", () => {
  const fila = (id: number) => ({ id, en: "2026-10-28T12:00:00Z", usuario_id: "u1", usuario_nombre: "Ana", evento_id: "e1", evento_nombre: "E", hoja_id: null, accion: "evento_creado", detalle: null });

  it("pide lo más nuevo primero, uno de más para saber si hay otra página, y filtra por evento y cursor", async () => {
    mock.respuestas.cap_auditoria = { data: [fila(9), fila(8), fila(7)], error: null };
    const r = await listarAuditoria({ eventoId: "e1", antes: 10, limite: 2 });
    const ops = operacionesDe("cap_auditoria");
    expect(ops).toContainEqual(["order", ["id", { ascending: false }]]);
    expect(ops).toContainEqual(["limit", [3]]);
    expect(ops).toContainEqual(["eq", ["evento_id", "e1"]]);
    expect(ops).toContainEqual(["lt", ["id", 10]]);
    expect(r.registros.map((x) => x.id)).toEqual([9, 8]);
    expect(r.hayMas).toBe(true);
    expect(r.registros[0]).toMatchObject({ usuarioNombre: "Ana", eventoNombre: "E", accion: "evento_creado" });
  });

  it("sin más resultados, hayMas es false", async () => {
    mock.respuestas.cap_auditoria = { data: [fila(2)], error: null };
    expect((await listarAuditoria({ limite: 5 })).hayMas).toBe(false);
  });

  it("limita el tamaño de página a 100", async () => {
    mock.respuestas.cap_auditoria = { data: [], error: null };
    await listarAuditoria({ limite: 5000 });
    expect(operacionesDe("cap_auditoria")).toContainEqual(["limit", [101]]);
  });

  it("si la consulta falla, el error llega a quien la pidió", async () => {
    mock.respuestas.cap_auditoria = { error: new Error("db") };
    await expect(listarAuditoria()).rejects.toThrow("db");
  });
});

describe("purgarAuditoria", () => {
  it("borra lo anterior al plazo y devuelve cuántos borró", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T12:00:00.000Z"));
    mock.respuestas.cap_auditoria = { data: [{ id: 1 }, { id: 2 }], error: null };
    const borrados = await purgarAuditoria(365);
    vi.useRealTimers();
    expect(borrados).toBe(2);
    expect(operacionesDe("cap_auditoria")).toContainEqual(["lt", ["en", "2025-10-28T12:00:00.000Z"]]);
  });

  it("si falla, lanza el error", async () => {
    mock.respuestas.cap_auditoria = { error: new Error("db") };
    await expect(purgarAuditoria()).rejects.toThrow("db");
  });
});
