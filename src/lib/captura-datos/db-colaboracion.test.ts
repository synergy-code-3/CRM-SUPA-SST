import { beforeEach, describe, expect, it, vi } from "vitest";

type Llamada = [string, ...unknown[]];
type Respuesta = { data: unknown; error: unknown };

// Cliente falso encadenable: registra cada llamada (tabla, filtros, orden) y responde con la siguiente respuesta en cola.
const falso = vi.hoisted(() => {
  const estado = { llamadas: [] as Llamada[][], respuestas: [] as Respuesta[], rpc: [] as unknown[][] };
  const consulta = (tabla: string) => {
    const llamadas: Llamada[] = [["from", tabla]];
    estado.llamadas.push(llamadas);
    const resolver = () => Promise.resolve(estado.respuestas.shift() ?? { data: [], error: null });
    const cadena: Record<string, unknown> = {
      then: (ok: (r: Respuesta) => unknown, ko: (e: unknown) => unknown) => resolver().then(ok, ko),
      maybeSingle: () => resolver(),
      single: () => resolver(),
    };
    for (const m of ["select", "update", "eq", "in", "or", "order", "limit", "lt", "gt", "not"]) {
      cadena[m] = (...args: unknown[]) => { llamadas.push([m, ...args]); return cadena; };
    }
    return cadena;
  };
  const cliente = {
    from: consulta,
    rpc: (nombre: string, args: unknown) => { estado.rpc.push([nombre, args]); return Promise.resolve(estado.respuestas.shift() ?? { data: null, error: null }); },
  };
  return { estado, cliente };
});
vi.mock("@/lib/supabase", () => ({ supabase: falso.cliente }));

import { cerrarEventoAbierto, liberarHojasDeUsuario, nombresDeUsuarios, registrarCapturista, siguientesHojasLibres, tomarHojaLibre } from "./db";

const filaHoja = (id: string, estatus = "Completo") => ({
  id, evento_id: "e1", estatus, origen: { nombreOriginal: `${id}.jpg` }, estado: "pendiente", bloqueada_por: null, bloqueada_hasta: null,
  campos: null, voucher_box: null, adjuntas: [], confirmada_por: null, confirmada_en: null, folio: null, version: 1,
});
const filaEvento = { id: "e1", nombre: "Evento", fecha: null, destino: {}, origen: "local", carpeta_fotos_id: null, estado: "confirmado", drive: null, creado_por: "u1", creado_en: "", confirmado_por: "u1", confirmado_en: "" };

beforeEach(() => {
  falso.estado.llamadas = [];
  falso.estado.respuestas = [];
  falso.estado.rpc = [];
});

describe("nombresDeUsuarios", () => {
  it("sin ids no consulta la base", async () => {
    expect(await nombresDeUsuarios([])).toEqual({});
    expect(falso.estado.llamadas).toHaveLength(0);
  });

  it("pide solo id y nombre, sin repetir ids, y devuelve un mapa", async () => {
    falso.estado.respuestas.push({ data: [{ id: "a", nombre: "Ana" }, { id: "b", nombre: "Marco" }], error: null });
    expect(await nombresDeUsuarios(["a", "b", "a"])).toEqual({ a: "Ana", b: "Marco" });
    expect(falso.estado.llamadas[0]).toEqual([["from", "usuarios"], ["select", "id, nombre"], ["in", "id", ["a", "b"]]]);
  });
});

describe("liberarHojasDeUsuario", () => {
  it("suelta solo las hojas de esa persona en ese evento, sin tocar las confirmadas, y devuelve cuántas", async () => {
    falso.estado.respuestas.push({ data: [{ id: "h1" }, { id: "h2" }], error: null });
    expect(await liberarHojasDeUsuario("e1", "u1")).toBe(2);
    const llamadas = falso.estado.llamadas[0];
    expect(llamadas).toContainEqual(["update", { bloqueada_por: null, bloqueada_hasta: null }]);
    expect(llamadas).toContainEqual(["eq", "evento_id", "e1"]);
    expect(llamadas).toContainEqual(["eq", "bloqueada_por", "u1"]);
    expect(llamadas).toContainEqual(["in", "estado", ["pendiente", "leida"]]);
    // Solo los bloqueos vigentes: el mismo criterio que el contador del botón (los vencidos ya están libres).
    expect(llamadas.find((c) => c[0] === "gt")?.[1]).toBe("bloqueada_hasta");
  });

  it("deja libre su cupo de capturista en el evento", async () => {
    falso.estado.respuestas.push({ data: [], error: null });
    await liberarHojasDeUsuario("e1", "u1");
    const cupo = falso.estado.llamadas[1];
    expect(cupo[0]).toEqual(["from", "cap_evento_capturistas"]);
    expect(cupo).toContainEqual(["eq", "usuario_id", "u1"]);
  });

  it("propaga el error de la base", async () => {
    falso.estado.respuestas.push({ data: null, error: { code: "XX000" } });
    await expect(liberarHojasDeUsuario("e1", "u1")).rejects.toMatchObject({ code: "XX000" });
  });
});

describe("cerrarEventoAbierto", () => {
  it("solo cierra si el evento sigue abierto", async () => {
    falso.estado.respuestas.push({ data: filaEvento, error: null });
    expect(await cerrarEventoAbierto("e1", "u1", null)).toMatchObject({ id: "e1", estado: "confirmado" });
    expect(falso.estado.llamadas[0]).toContainEqual(["eq", "estado", "abierto"]);
  });

  it("devuelve null si otra persona ya lo cerró (dos confirmaciones a la vez)", async () => {
    falso.estado.respuestas.push({ data: null, error: null });
    expect(await cerrarEventoAbierto("e1", "u1", null)).toBeNull();
  });
});

describe("registrarCapturista", () => {
  it("devuelve false para el orden normal y true para el inverso", async () => {
    falso.estado.respuestas.push({ data: "normal", error: null }, { data: "inverso", error: null });
    expect(await registrarCapturista("e1", "u1")).toBe(false);
    expect(await registrarCapturista("e1", "u2")).toBe(true);
    expect(falso.estado.rpc[0]).toEqual(["registrar_capturista", { p_evento: "e1", p_usuario: "u1" }]);
  });

  it("una tercera persona recibe 409", async () => {
    falso.estado.respuestas.push({ data: "lleno", error: null });
    await expect(registrarCapturista("e1", "u3")).rejects.toMatchObject({ status: 409 });
  });

  it("si la base aún no tiene la función, no limita a nadie", async () => {
    falso.estado.respuestas.push({ data: null, error: { code: "PGRST202" } });
    expect(await registrarCapturista("e1", "u1")).toBe(false);
  });
});

describe("tomarHojaLibre", () => {
  it("llama a la función con solo evento y usuario: la base decide el sentido", async () => {
    falso.estado.respuestas.push({ data: filaHoja("h1"), error: null });
    expect((await tomarHojaLibre("e1", "u1"))?.id).toBe("h1");
    expect(falso.estado.rpc[0]).toEqual(["tomar_hoja_libre", { p_evento: "e1", p_usuario: "u1" }]);
  });

  it("una tercera persona recibe 409", async () => {
    falso.estado.respuestas.push({ data: null, error: { code: "P0001", message: "evento_lleno" } });
    await expect(tomarHojaLibre("e1", "u3")).rejects.toMatchObject({ status: 409 });
  });
});

describe("siguientesHojasLibres", () => {
  it("en orden normal recorre Completo → Apartado → Interesado por id ascendente", async () => {
    falso.estado.respuestas.push({ data: [filaHoja("a")], error: null }, { data: [], error: null }, { data: [], error: null });
    await siguientesHojasLibres("e1", 3);
    expect(falso.estado.llamadas.map((l) => l.find((c) => c[0] === "eq" && c[1] === "estatus")?.[2])).toEqual(["Completo", "Apartado", "Interesado"]);
    expect(falso.estado.llamadas[0]).toContainEqual(["order", "id", { ascending: true }]);
  });

  it("desde el final recorre Interesado → Apartado → Completo por id descendente", async () => {
    falso.estado.respuestas.push({ data: [filaHoja("z", "Interesado")], error: null }, { data: [], error: null }, { data: [], error: null });
    const hojas = await siguientesHojasLibres("e1", 3, true);
    expect(hojas.map((h) => h.id)).toEqual(["z"]);
    expect(falso.estado.llamadas.map((l) => l.find((c) => c[0] === "eq" && c[1] === "estatus")?.[2])).toEqual(["Interesado", "Apartado", "Completo"]);
    expect(falso.estado.llamadas[0]).toContainEqual(["order", "id", { ascending: false }]);
  });
});
