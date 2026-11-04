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
const almacen = vi.hoisted(() => ({ falla: false }));
const subir = vi.hoisted(() => vi.fn(async () => { if (almacen.falla) throw new Error("storage"); }));
vi.mock("@/lib/storage", () => ({ subirArchivoHistorial: subir }));

import { listarAuditoria, listarConfirmaciones, nombresDeFotos, purgarAuditoria, registrarAuditoria, registrarConfirmacionDeHoja } from "./auditoria";
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

  it("guarda cuándo se tomó la hoja, cuánto tardó y cuántos cambios se guardaron", async () => {
    const previa = { ...hoja("leida", campos()), tomadaEn: "2026-10-28T11:59:50.000Z", guardadosDesdeToma: 2 };
    await registrarConfirmacionDeHoja({ usuario, previa, hoja: { ...hoja("confirmada", campos()), confirmadaEn: "2026-10-28T12:00:00.000Z" }, duplicadoForzado: false });
    expect(insertado()?.detalle).toEqual({ folio: "4476", inicio: "2026-10-28T11:59:50.000Z", segundos: 10, guardados: 2 });
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

describe("listarConfirmaciones", () => {
  it("pide solo las hojas confirmadas del evento y avisa si el tope cortó la lista", async () => {
    mock.respuestas.cap_auditoria = { data: [], error: null };
    await listarConfirmaciones({ eventoId: "e1", fechaDesde: "2026-10-01T00:00:00.000Z" });
    const ops = operacionesDe("cap_auditoria");
    expect(ops).toContainEqual(["eq", ["accion", "hoja_confirmada"]]);
    expect(ops).toContainEqual(["eq", ["evento_id", "e1"]]);
    expect(ops).toContainEqual(["gte", ["en", "2026-10-01T00:00:00.000Z"]]);
  });
});

describe("nombresDeFotos", () => {
  it("usa el formato folio_Nombre y, sin esos datos, el nombre original del archivo", async () => {
    mock.respuestas.cap_hojas = { data: [
      { id: "h1", origen: { nombreOriginal: "WhatsApp Image 2026.jpeg" }, campos: campos({ nombre: "María Pérez" }) },
      { id: "h2", origen: { nombreOriginal: "lista.pdf", pagina: 2 }, campos: campos({ folio: "12", nombre: "Ana" }) },
      { id: "h3", origen: { nombreOriginal: "IMG_9.jpg" }, campos: null },
    ], error: null };
    const n = await nombresDeFotos(["h1", "h2", "h3"]);
    expect(n.get("h1")).toBe("4476_Maria_Perez.jpg");
    expect(n.get("h2")).toBe("12_Ana.pdf (pág. 2)");
    expect(n.get("h3")).toBe("IMG_9.jpg");
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

  it("con desde pide solo los registros más nuevos que ese id", async () => {
    mock.respuestas.cap_auditoria = { data: [fila(12)], error: null };
    await listarAuditoria({ desde: 10 });
    expect(operacionesDe("cap_auditoria")).toContainEqual(["gt", ["id", 10]]);
  });

  it("al buscar texto también incluye los movimientos de las hojas cuyo cliente se llama así", async () => {
    mock.respuestas.cap_hojas = { data: [{ id: "h1" }, { id: "h2" }], error: null };
    mock.respuestas.cap_auditoria = { data: [], error: null };
    await listarAuditoria({ q: "Ana" });
    const [, [condiciones]] = operacionesDe("cap_auditoria").find(([op]) => op === "or")!;
    expect(condiciones).toContain("hoja_id.in.(h1,h2)");
    expect(condiciones).toContain("evento_nombre.ilike.%Ana%");
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
  const fila = (id: number, en: string) => ({ id, en, usuario_id: null, usuario_nombre: "Ana", evento_id: null, evento_nombre: "Evento", hoja_id: null, accion: "evento_creado", detalle: null });

  beforeEach(() => {
    subir.mockClear();
    almacen.falla = false;
  });

  it("guarda un CSV de lo anterior al plazo y luego lo borra", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T12:00:00.000Z"));
    mock.respuestas.cap_auditoria = { data: [fila(1, "2026-01-02T10:00:00.000Z"), fila(2, "2026-03-05T10:00:00.000Z")], error: null };
    const r = await purgarAuditoria(180);
    vi.useRealTimers();
    expect(r).toEqual({ borrados: 2, archivo: "historial_2026-01-02_a_2026-03-05.csv" });
    expect(subir).toHaveBeenCalledWith("historial_2026-01-02_a_2026-03-05.csv", expect.stringContaining("Creó el evento"));
    expect(operacionesDe("cap_auditoria")).toContainEqual(["lt", ["en", "2026-05-01T12:00:00.000Z"]]);
  });

  it("si no hay nada viejo, no sube ni borra", async () => {
    mock.respuestas.cap_auditoria = { data: [], error: null };
    expect(await purgarAuditoria()).toEqual({ borrados: 0, archivo: null });
    expect(subir).not.toHaveBeenCalled();
  });

  it("si el CSV no se pudo guardar, no borra", async () => {
    mock.respuestas.cap_auditoria = { data: [fila(1, "2026-01-02T10:00:00.000Z")], error: null };
    almacen.falla = true;
    let mensaje = "";
    try {
      await purgarAuditoria();
    } catch (e) {
      mensaje = (e as Error).message;
    }
    expect(mensaje).toBe("storage");
    expect(operacionesDe("cap_auditoria").some(([m]) => m === "delete")).toBe(false);
  });

  it("si falla la base, lanza el error", async () => {
    mock.respuestas.cap_auditoria = { error: new Error("db") };
    await expect(purgarAuditoria()).rejects.toThrow("db");
  });
});
