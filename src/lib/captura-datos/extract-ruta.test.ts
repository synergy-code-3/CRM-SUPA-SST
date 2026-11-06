import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  hoja: {} as Record<string, unknown>,
  db: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/auth", () => ({ requerirPermiso: async () => ({ ok: true, usuario: { id: "yo", rol: "coordinador" } }) }));
vi.mock("@/lib/captura-datos/acceso", () => ({ requerirHoja: async () => m.hoja }));
vi.mock("@/lib/captura-datos/extract", () => ({ extractFromImage: vi.fn() }));
vi.mock("@/lib/captura-datos/huella", () => ({ huellaImagen: () => "huella" }));
vi.mock("@/lib/captura-datos/lectura-ia", () => ({
  adelantarLecturas: vi.fn(),
  datosDeExtraccion: () => ({ campos: {}, voucherBox: null }),
  fotoBase64: async () => ({ base64: "x", mime: "image/jpeg" }),
}));
vi.mock("@/lib/captura-datos/db", async (orig) => {
  const real = await orig<typeof import("@/lib/captura-datos/db")>();
  m.db = {
    registrarCapturista: vi.fn(async () => false),
    esNoValida: vi.fn(async () => false),
    reclamarLecturaIa: vi.fn(async () => true),
    devolverLecturaIa: vi.fn(async () => undefined),
    finalizarLecturaIa: vi.fn(async () => undefined),
    marcarHojaNoValida: vi.fn(async () => undefined),
    actualizarCamposHoja: vi.fn(async () => ({ id: "h1" })),
  };
  return { ...real, ...m.db };
});

import { extractFromImage } from "@/lib/captura-datos/extract";
import { ErrorHojaOcupada } from "@/lib/captura-datos/db";
import { POST } from "../../app/api/captura-datos/hojas/[id]/extract/route";

const FUTURO = new Date(Date.now() + 5 * 60_000).toISOString();
const llamar = () => POST({} as never, { params: Promise.resolve({ id: "h1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  m.hoja = { id: "h1", eventoId: "e1", estatus: "Completo", origen: { nombreOriginal: "a.jpg" }, estado: "pendiente", bloqueadaPorId: null, bloqueadaHasta: null };
  vi.mocked(extractFromImage).mockResolvedValue({ esHojaDeRegistro: true } as never);
});

describe("POST hojas/[id]/extract", () => {
  it("si otra persona tiene la hoja, responde 409 sin gastar la lectura con IA", async () => {
    m.hoja = { ...m.hoja, bloqueadaPorId: "otra", bloqueadaHasta: FUTURO };
    const r = await llamar();
    expect(r.status).toBe(409);
    expect(m.db.reclamarLecturaIa).not.toHaveBeenCalled();
    expect(extractFromImage).not.toHaveBeenCalled();
  });

  it("si al guardar la lectura la hoja ya es de otra persona, devuelve la lectura para poder repetirla", async () => {
    m.db.actualizarCamposHoja.mockRejectedValueOnce(new ErrorHojaOcupada());
    const r = await llamar();
    expect(r.status).toBe(409);
    expect(m.db.devolverLecturaIa).toHaveBeenCalledTimes(1);
    expect(m.db.finalizarLecturaIa).not.toHaveBeenCalled();
  });

  it("si todo sale bien deja la lectura gastada", async () => {
    const r = await llamar();
    expect(r.status).toBe(200);
    expect(m.db.finalizarLecturaIa).toHaveBeenCalledTimes(1);
    expect(m.db.devolverLecturaIa).not.toHaveBeenCalled();
  });
});
