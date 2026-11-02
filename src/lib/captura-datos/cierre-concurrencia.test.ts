import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  obtenerEvento: vi.fn(),
  listarHojasDeEvento: vi.fn(),
  eventoFueReabierto: vi.fn(),
  cerrarEventoAbierto: vi.fn(),
  registrarAuditoria: vi.fn(),
  generarExcelEvento: vi.fn(),
  subirExcelEvento: vi.fn(),
  renombrarFotosDeEvento: vi.fn(),
}));
vi.mock("./db", () => ({ obtenerEvento: m.obtenerEvento, listarHojasDeEvento: m.listarHojasDeEvento, eventoFueReabierto: m.eventoFueReabierto, cerrarEventoAbierto: m.cerrarEventoAbierto }));
vi.mock("./auditoria", () => ({ registrarAuditoria: m.registrarAuditoria }));
vi.mock("./excel", () => ({ generarExcelEvento: m.generarExcelEvento }));
vi.mock("./google", () => ({ renombrarFotosDeEvento: m.renombrarFotosDeEvento }));
vi.mock("@/lib/storage", () => ({ subirExcelEvento: m.subirExcelEvento }));

import { cerrarEventoSiCompleto } from "./cierre";

const usuario = { id: "u1", nombre: "Ana" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  m.obtenerEvento.mockResolvedValue({ id: "e1", nombre: "Evento", estado: "abierto", drive: null });
  m.listarHojasDeEvento.mockResolvedValue([{ estado: "confirmada" }]);
  m.eventoFueReabierto.mockResolvedValue(false);
  m.generarExcelEvento.mockResolvedValue(Buffer.from(""));
  m.subirExcelEvento.mockResolvedValue(undefined);
  m.renombrarFotosDeEvento.mockResolvedValue(undefined);
});

describe("cerrarEventoSiCompleto con dos personas", () => {
  it("cierra, registra y genera el Excel cuando gana el cierre", async () => {
    m.cerrarEventoAbierto.mockResolvedValue({ id: "e1" });
    expect(await cerrarEventoSiCompleto("e1", usuario)).toBe(true);
    expect(m.registrarAuditoria).toHaveBeenCalledTimes(1);
    expect(m.subirExcelEvento).toHaveBeenCalledTimes(1);
  });

  it("si otra persona lo cerró un instante antes, no registra ni genera nada dos veces", async () => {
    m.cerrarEventoAbierto.mockResolvedValue(null);
    expect(await cerrarEventoSiCompleto("e1", usuario)).toBe(false);
    expect(m.registrarAuditoria).not.toHaveBeenCalled();
    expect(m.subirExcelEvento).not.toHaveBeenCalled();
    expect(m.renombrarFotosDeEvento).not.toHaveBeenCalled();
  });
});
