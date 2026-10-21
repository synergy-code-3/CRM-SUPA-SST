import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ErrorApi } from "./cliente";

function respuesta(status: number, cuerpo: unknown) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("api()", () => {
  it("devuelve el JSON si la respuesta es 2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta(200, { ok: 1 })));
    await expect(api("/x")).resolves.toEqual({ ok: 1 });
  });

  it("manda json con POST y Content-Type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    await api("/x", { json: { a: 1 } });
    expect(fetchMock).toHaveBeenCalledWith("/x", expect.objectContaining({ method: "POST", body: '{"a":1}', headers: { "Content-Type": "application/json" } }));
  });

  it("lanza ErrorApi con el mensaje y los datos del servidor", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta(409, { error: "Folio repetido", duplicado: { id: "h" } })));
    const err = (await api("/x").catch((e: unknown) => e)) as ErrorApi;
    expect(err).toBeInstanceOf(ErrorApi);
    expect(err.message).toBe("Folio repetido");
    expect(err.status).toBe(409);
    expect(err.datos.duplicado).toEqual({ id: "h" });
  });

  it("usa un mensaje genérico si el cuerpo no es JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 500 })));
    await expect(api("/x")).rejects.toThrow("Algo salió mal");
  });
});
