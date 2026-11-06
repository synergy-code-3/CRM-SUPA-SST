import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FIELDS } from "./fields";

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
    for (const m of ["select", "update", "eq", "neq", "in", "or", "order", "limit", "lt", "gt", "not", "is"]) {
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

import { cerrarEventoAbierto, confirmarHoja, guardarLecturaAdelantada, ErrorEstadoHoja, exigirEventoAbiertoSiConfirmada, liberarHojasDeOtroEstatus, liberarHojasDeUsuario, nombresDeUsuarios, registrarCapturista, siguientesHojasLibres, tomarHojaLibre } from "./db";

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
  it("suelta solo las hojas de esa persona en ese evento, incluida una confirmada en corrección, y devuelve cuántas", async () => {
    falso.estado.respuestas.push({ data: [{ id: "h1" }, { id: "h2" }], error: null });
    expect(await liberarHojasDeUsuario("e1", "u1")).toBe(2);
    const llamadas = falso.estado.llamadas[0];
    expect(llamadas).toContainEqual(["update", { bloqueada_por: null, bloqueada_hasta: null }]);
    expect(llamadas).toContainEqual(["eq", "evento_id", "e1"]);
    expect(llamadas).toContainEqual(["eq", "bloqueada_por", "u1"]);
    expect(llamadas).toContainEqual(["in", "estado", ["pendiente", "leida", "confirmada"]]);
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
    expect(await registrarCapturista("e1", "u1", "Completo")).toBe(false);
    expect(await registrarCapturista("e1", "u2", "Completo")).toBe(true);
    expect(falso.estado.rpc[0]).toEqual(["registrar_capturista", { p_evento: "e1", p_usuario: "u1", p_estatus: "Completo" }]);
  });

  it("una quinta persona en el mismo estado recibe 409", async () => {
    falso.estado.respuestas.push({ data: "lleno", error: null });
    await expect(registrarCapturista("e1", "u5", "Apartado")).rejects.toMatchObject({ status: 409 });
  });

  it("si la base no tiene la función falla en voz alta en vez de dejar de limitar a todos", async () => {
    falso.estado.respuestas.push({ data: null, error: { code: "PGRST202" } });
    await expect(registrarCapturista("e1", "u1", "Completo")).rejects.toMatchObject({ code: "PGRST202" });
  });
});

describe("tomarHojaLibre", () => {
  it("llama a la función con el estado elegido: la base decide el sentido", async () => {
    falso.estado.respuestas.push({ data: filaHoja("h1", "Apartado"), error: null });
    expect((await tomarHojaLibre("e1", "u1", "Apartado"))?.id).toBe("h1");
    expect(falso.estado.rpc[0]).toEqual(["tomar_hoja_libre", { p_evento: "e1", p_usuario: "u1", p_estatus: "Apartado" }]);
  });

  it("una quinta persona en el mismo estado recibe 409", async () => {
    falso.estado.respuestas.push({ data: null, error: { code: "P0001", message: "evento_lleno" } });
    await expect(tomarHojaLibre("e1", "u5", "Completo")).rejects.toMatchObject({ status: 409 });
  });
});

describe("siguientesHojasLibres", () => {
  it("en orden normal consulta solo el estado pedido por id ascendente", async () => {
    falso.estado.respuestas.push({ data: [filaHoja("a")], error: null });
    const hojas = await siguientesHojasLibres("e1", 3, false, "Completo");
    expect(hojas.map((h) => h.id)).toEqual(["a"]);
    expect(falso.estado.llamadas).toHaveLength(1);
    expect(falso.estado.llamadas[0]).toContainEqual(["eq", "estatus", "Completo"]);
    expect(falso.estado.llamadas[0]).toContainEqual(["order", "id", { ascending: true }]);
  });

  it("desde el final ordena por id descendente", async () => {
    falso.estado.respuestas.push({ data: [filaHoja("z", "Interesado")], error: null });
    const hojas = await siguientesHojasLibres("e1", 3, true, "Interesado");
    expect(hojas.map((h) => h.id)).toEqual(["z"]);
    expect(falso.estado.llamadas[0]).toContainEqual(["eq", "estatus", "Interesado"]);
    expect(falso.estado.llamadas[0]).toContainEqual(["order", "id", { ascending: false }]);
  });
});

const hojaModelo = (estado: string) => ({ id: "h1", eventoId: "e1", estado }) as never;

describe("exigirEventoAbiertoSiConfirmada", () => {
  it("una hoja pendiente no consulta el evento", async () => {
    await exigirEventoAbiertoSiConfirmada(hojaModelo("pendiente"));
    expect(falso.estado.llamadas).toHaveLength(0);
  });

  it("rechaza una hoja confirmada cuyo evento ya está cerrado", async () => {
    falso.estado.respuestas.push({ data: filaEvento, error: null });
    await expect(exigirEventoAbiertoSiConfirmada(hojaModelo("confirmada"))).rejects.toBeInstanceOf(ErrorEstadoHoja);
  });

  it("permite corregir una hoja confirmada con el evento abierto", async () => {
    falso.estado.respuestas.push({ data: { ...filaEvento, estado: "abierto" }, error: null });
    await expect(exigirEventoAbiertoSiConfirmada(hojaModelo("confirmada"))).resolves.toBeUndefined();
  });
});

describe("liberarHojasDeOtroEstatus", () => {
  it("suelta solo las hojas vigentes de esa persona en los demás estados del evento", async () => {
    await liberarHojasDeOtroEstatus("e1", "u1", "Apartado");
    const llamadas = falso.estado.llamadas[0];
    expect(llamadas).toContainEqual(["update", { bloqueada_por: null, bloqueada_hasta: null }]);
    expect(llamadas).toContainEqual(["eq", "evento_id", "e1"]);
    expect(llamadas).toContainEqual(["eq", "bloqueada_por", "u1"]);
    expect(llamadas).toContainEqual(["neq", "estatus", "Apartado"]);
    expect(llamadas).toContainEqual(["in", "estado", ["pendiente", "leida"]]);
  });
});

describe("confirmarHoja con folio repetido en carrera", () => {
  const campos = { ...EMPTY_FIELDS, folio: "12", nombre: "Ana Lopez", correo: "ana@mail.com", telefono: "3312345678" };
  const actual = { estatus: "Interesado", estado: "pendiente", version: 1, evento_id: "e1", bloqueada_por: null, bloqueada_hasta: null, campos: null };
  const choque = { data: null, error: { code: "23505" } };

  it("si el índice único rechaza el folio de otro evento, responde con ese duplicado", async () => {
    falso.estado.respuestas.push({ data: actual, error: null }, { data: null, error: null }, choque, { data: { id: "h9", evento_id: "e2", cap_eventos: { nombre: "Otro" } }, error: null });
    await expect(confirmarHoja("h1", "u1", campos, null)).rejects.toMatchObject({ forzable: true });
  });

  it("si el duplicado está en este mismo evento, responde con ese duplicado sin ofrecer forzarlo", async () => {
    falso.estado.respuestas.push({ data: actual, error: null }, { data: null, error: null }, choque, { data: { id: "h9", evento_id: "e1", cap_eventos: { nombre: "Este" } }, error: null });
    await expect(confirmarHoja("h1", "u1", campos, null)).rejects.toMatchObject({ forzable: false });
  });

  it("un duplicado del mismo evento detectado antes del update tampoco se puede forzar", async () => {
    falso.estado.respuestas.push({ data: actual, error: null }, { data: { id: "h9", evento_id: "e1", cap_eventos: { nombre: "Este" } }, error: null });
    await expect(confirmarHoja("h1", "u1", campos, null)).rejects.toMatchObject({ forzable: false });
  });
});

describe("guardarLecturaAdelantada", () => {
  it("no guarda si alguien tomó la hoja mientras la IA leía (select y update exigen que siga libre)", async () => {
    falso.estado.respuestas.push({ data: { version: 1 }, error: null }, { data: { id: "h1" }, error: null });
    expect(await guardarLecturaAdelantada("h1", EMPTY_FIELDS, null, { nombreOriginal: "a.jpg" })).toBe(true);
    for (const llamadas of falso.estado.llamadas) {
      expect(llamadas.find((c) => c[0] === "or")?.[1]).toMatch(/^bloqueada_hasta\.is\.null,bloqueada_hasta\.lt\./);
    }
  });
});

describe("confirmarHoja: el bloqueo también va en el UPDATE", () => {
  it("no pisa a quien tomó la hoja entre la lectura y el guardado", async () => {
    const campos = { ...EMPTY_FIELDS, folio: "12", nombre: "Ana Lopez", correo: "ana@mail.com", telefono: "3312345678" };
    const actual = { estatus: "Interesado", estado: "pendiente", version: 1, evento_id: "e1", bloqueada_por: null, bloqueada_hasta: null, campos: null };
    falso.estado.respuestas.push({ data: actual, error: null }, { data: null, error: null }, { data: filaHoja("h1", "Interesado"), error: null });
    await confirmarHoja("h1", "u1", campos, null);
    const update = falso.estado.llamadas[2];
    expect(update.find((c) => c[0] === "or")?.[1]).toMatch(/bloqueada_por\.is\.null,bloqueada_por\.eq\.u1,bloqueada_hasta\.lt\./);
  });
});
