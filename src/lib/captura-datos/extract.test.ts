import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const genai = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    constructor({ message, status }: { message: string; status: number }) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }
  return { ApiError, generateContent: vi.fn() };
});
vi.mock("@google/genai", () => ({
  ApiError: genai.ApiError,
  ThinkingLevel: { LOW: "LOW" },
  GoogleGenAI: class {
    models = { generateContent: genai.generateContent };
  },
}));

import { extractFromImage } from "./extract";

const LEIDA = {
  esHojaDeRegistro: true, motivoNoHoja: "", folio: "4476", nombre: "Ana Pérez", correo: "ana@gmail.com", lada: "+52",
  telefono: "3312345678", tieneVoucher: false, voucherCaja: null, metodoPago: "", tarjeta: "", marcaTarjeta: "",
  cantidad: "9997.00", membresia: "3 Meses",
};

const buena = { text: JSON.stringify(LEIDA) };

function falla(status: number, estado = "UNAVAILABLE", mensaje = "This model is currently experiencing high demand.") {
  return new genai.ApiError({ message: JSON.stringify({ error: { code: status, message: mensaje, status: estado } }), status });
}

/** Corre la lectura avanzando los relojes simulados (las esperas entre intentos son de 2 s). */
async function leer(base64 = "QUJD", mime = "image/jpeg") {
  const lectura = extractFromImage(base64, mime);
  lectura.catch(() => {}); // evita "unhandled rejection" mientras avanza el reloj; el test la espera después
  await vi.advanceTimersByTimeAsync(10_000);
  return lectura;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.GEMINI_API_KEY = "clave-falsa";
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.GEMINI_API_KEY;
});

const modeloDeLlamada = (n: number) => genai.generateContent.mock.calls[n][0].model;

describe("extractFromImage (Gemini)", () => {
  it("lee la hoja con el modelo principal, razonamiento bajo y plazo por intento", async () => {
    genai.generateContent.mockResolvedValue(buena);
    const r = await leer();
    expect(r).toMatchObject({ esHojaDeRegistro: true, folio: "4476", nombre: "Ana Pérez" });
    expect(genai.generateContent).toHaveBeenCalledTimes(1);
    const peticion = genai.generateContent.mock.calls[0][0];
    expect(peticion.model).toBe("gemini-3.6-flash");
    expect(peticion.config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
    expect(peticion.config.httpOptions.timeout).toBe(35_000);
    expect(peticion.contents[0].parts[0].inlineData).toEqual({ mimeType: "image/jpeg", data: "QUJD" });
  });

  it("manda como JPEG un tipo de archivo que Gemini no acepta", async () => {
    genai.generateContent.mockResolvedValue(buena);
    await leer("QUJD", "application/octet-stream");
    expect(genai.generateContent.mock.calls[0][0].contents[0].parts[0].inlineData.mimeType).toBe("image/jpeg");
  });

  it("ante 'alta demanda' (503) reintenta con el mismo modelo y lee", async () => {
    genai.generateContent.mockRejectedValueOnce(falla(503)).mockResolvedValueOnce(buena);
    const r = await leer();
    expect(r.folio).toBe("4476");
    expect(genai.generateContent).toHaveBeenCalledTimes(2);
    expect(modeloDeLlamada(1)).toBe("gemini-3.6-flash");
  });

  it("si el principal sigue saturado, el tercer intento usa el modelo de respaldo", async () => {
    genai.generateContent.mockRejectedValueOnce(falla(503)).mockRejectedValueOnce(falla(503)).mockResolvedValueOnce(buena);
    const r = await leer();
    expect(r.folio).toBe("4476");
    expect(genai.generateContent).toHaveBeenCalledTimes(3);
    expect(modeloDeLlamada(2)).toBe("gemini-3.5-flash");
  });

  it("si los tres intentos reciben 503, explica la alta demanda en español", async () => {
    genai.generateContent.mockRejectedValue(falla(503));
    await expect(leer()).rejects.toMatchObject({ status: 503, message: expect.stringContaining("alta demanda") });
    expect(genai.generateContent).toHaveBeenCalledTimes(3);
  });

  it("si se agota la cuota (429) en todos los intentos, lo dice", async () => {
    genai.generateContent.mockRejectedValue(falla(429, "RESOURCE_EXHAUSTED", "quota"));
    await expect(leer()).rejects.toMatchObject({ status: 503, message: expect.stringContaining("cuota") });
  });

  it("un error que no es transitorio (400) no se reintenta y muestra el motivo de Gemini", async () => {
    genai.generateContent.mockRejectedValue(falla(400, "INVALID_ARGUMENT", "Invalid JSON payload"));
    await expect(leer()).rejects.toMatchObject({ status: 502, message: expect.stringContaining("Gemini 400: INVALID_ARGUMENT Invalid JSON payload") });
    expect(genai.generateContent).toHaveBeenCalledTimes(1);
  });

  it("un plazo vencido (timeout) se trata como transitorio", async () => {
    const abortado = Object.assign(new Error("aborted"), { name: "AbortError" });
    genai.generateContent.mockRejectedValueOnce(abortado).mockResolvedValueOnce(buena);
    const r = await leer();
    expect(r.folio).toBe("4476");
    expect(genai.generateContent).toHaveBeenCalledTimes(2);
  });

  it("si Gemini no devuelve JSON, falla sin reintentar", async () => {
    genai.generateContent.mockResolvedValue({ text: "esto no es json" });
    await expect(leer()).rejects.toMatchObject({ status: 502 });
    expect(genai.generateContent).toHaveBeenCalledTimes(1);
  });

  it("si la respuesta no cumple el esquema, falla sin reintentar", async () => {
    genai.generateContent.mockResolvedValue({ text: JSON.stringify({ ...LEIDA, lada: "+99" }) });
    await expect(leer()).rejects.toMatchObject({ status: 502 });
    expect(genai.generateContent).toHaveBeenCalledTimes(1);
  });

  it("sin GEMINI_API_KEY avisa que falta configurarla", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(leer()).rejects.toMatchObject({ status: 503, message: expect.stringContaining("GEMINI_API_KEY") });
    expect(genai.generateContent).not.toHaveBeenCalled();
  });
});
