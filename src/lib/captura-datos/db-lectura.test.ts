import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { LEASE_LECTURA_IA_MS, sinReclamoVencido } from "./db";

const AHORA = new Date("2026-10-27T12:00:00.000Z");
const hace = (ms: number) => new Date(AHORA.getTime() - ms).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
});
afterEach(() => vi.useRealTimers());

describe("sinReclamoVencido", () => {
  it("deja igual una hoja sin lectura con IA", () => {
    const origen = { nombreOriginal: "a.jpg" };
    expect(sinReclamoVencido(origen)).toBe(origen);
  });

  it("deja igual una hoja ya leída (sin marca de 'en curso')", () => {
    const origen = { nombreOriginal: "a.jpg", leidaIa: true };
    expect(sinReclamoVencido(origen)).toBe(origen);
  });

  it("respeta una lectura en curso reciente", () => {
    const origen = { nombreOriginal: "a.jpg", leidaIa: true, leidaIaDesde: hace(LEASE_LECTURA_IA_MS - 1_000) };
    expect(sinReclamoVencido(origen)).toBe(origen);
  });

  it("libera una lectura en curso abandonada (la función murió a medias)", () => {
    const origen = { nombreOriginal: "a.jpg", driveId: "d1", leidaIa: true, leidaIaDesde: hace(LEASE_LECTURA_IA_MS + 1_000) };
    const liberada = sinReclamoVencido(origen);
    expect(liberada.leidaIa).toBeUndefined();
    expect(liberada.leidaIaDesde).toBeUndefined();
    expect(liberada).toMatchObject({ nombreOriginal: "a.jpg", driveId: "d1" });
  });
});
