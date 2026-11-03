import { beforeEach, describe, expect, it, vi } from "vitest";

type Llamada = [string, ...unknown[]];
type Respuesta = { data: unknown; error: unknown };

const falso = vi.hoisted(() => {
  const estado = { llamadas: [] as Llamada[][], respuestas: [] as Respuesta[] };
  const consulta = (tabla: string) => {
    const llamadas: Llamada[] = [["from", tabla]];
    estado.llamadas.push(llamadas);
    const cadena: Record<string, unknown> = {
      then: (ok: (r: Respuesta) => unknown, ko: (e: unknown) => unknown) =>
        Promise.resolve(estado.respuestas.shift() ?? { data: [], error: null }).then(ok, ko),
    };
    for (const m of ["select", "eq", "in", "order", "limit"]) {
      cadena[m] = (...args: unknown[]) => { llamadas.push([m, ...args]); return cadena; };
    }
    return cadena;
  };
  return { estado, cliente: { from: consulta } };
});
vi.mock("@/lib/supabase", () => ({ supabase: falso.cliente }));

import { listarHojasDeCliente } from "./db";

const fila = (id: string, en: string, origen: object = { nombreOriginal: `${id}.jpg` }, campos: object = { correo: "a@x.com", telefono: "5512345678" }) => ({
  id, folio: `F${id}`, origen, campos, confirmada_en: en, cap_eventos: { nombre: `Evento ${id}`, fecha: "2026-10-01" },
});
const cliente = { id: "a@x.com", email: "a@x.com", telefono: "+525512345678" };

beforeEach(() => { falso.estado.llamadas = []; falso.estado.respuestas = []; });

describe("listarHojasDeCliente", () => {
  it("busca hojas confirmadas por correo y por teléfono, y las junta sin repetir, la más reciente primero", async () => {
    falso.estado.respuestas = [
      { data: [fila("1", "2026-10-01"), fila("2", "2026-10-05")], error: null },
      { data: [fila("2", "2026-10-05"), fila("3", "2026-09-01", { nombreOriginal: "x.pdf" })], error: null },
    ];
    const r = await listarHojasDeCliente(cliente);
    expect(r.map((h) => h.id)).toEqual(["2", "1", "3"]);
    expect(r[0]).toMatchObject({ folio: "F2", eventoNombre: "Evento 2", eventoFecha: "2026-10-01", esPdf: false });
    expect(r[2].esPdf).toBe(true);
    const filtros = falso.estado.llamadas.map((l) => l.filter(([m]) => m === "eq" || m === "in"));
    expect(filtros[0]).toContainEqual(["in", "campos->>correo", ["a@x.com"]]);
    expect(filtros[1]).toContainEqual(["eq", "campos->>telefono", "5512345678"]);
    expect(falso.estado.llamadas.every((l) => l.some(([m, c, v]) => m === "eq" && c === "estado" && v === "confirmada"))).toBe(true);
  });

  it("descarta filas que no coinciden con el cliente aunque la base las devuelva", async () => {
    falso.estado.respuestas = [{ data: [fila("1", "2026-10-01", undefined, { correo: "otro@x.com", telefono: "5500000000" }), fila("2", "2026-10-02")], error: null }];
    expect((await listarHojasDeCliente({ ...cliente, telefono: null })).map((h) => h.id)).toEqual(["2"]);
  });

  it("reconoce .PDF en mayúsculas", async () => {
    falso.estado.respuestas = [{ data: [fila("1", "2026-10-01", { nombreOriginal: "x.jpg", rutaStorage: "r/X.PDF" })], error: null }];
    expect((await listarHojasDeCliente({ ...cliente, telefono: null }))[0].esPdf).toBe(true);
  });

  it("sin teléfono válido solo consulta por correo", async () => {
    falso.estado.respuestas = [{ data: [], error: null }];
    expect(await listarHojasDeCliente({ ...cliente, telefono: null })).toEqual([]);
    expect(falso.estado.llamadas).toHaveLength(1);
  });

  it("propaga el error de la base", async () => {
    falso.estado.respuestas = [{ data: null, error: new Error("falló") }, { data: [], error: null }];
    await expect(listarHojasDeCliente(cliente)).rejects.toThrow("falló");
  });
});
