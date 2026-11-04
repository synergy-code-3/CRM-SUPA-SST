import { describe, expect, it } from "vitest";
import { EMPTY_FIELDS, type SheetFields } from "./fields";
import { diferenciasDeCampos, duracionLegible, ETIQUETA_ACCION, lineasDeDetalle, resumirCaptura, SEGUNDOS_CAPTURA_RAPIDA, type AccionAuditoria, type RegistroAuditoria } from "./historial";

const campos = (sobreescribir: Partial<SheetFields> = {}): SheetFields => ({ ...EMPTY_FIELDS, folio: "4476", nombre: "Ana Pérez", ...sobreescribir });

function registro(accion: AccionAuditoria, detalle: Record<string, unknown> | null = null): RegistroAuditoria {
  return { id: 1, en: "2026-10-28T12:00:00.000Z", usuarioId: "u1", usuarioNombre: "Ana", eventoId: "e1", eventoNombre: "Evento", hojaId: null, accion, detalle };
}

describe("diferenciasDeCampos", () => {
  it("devuelve solo los campos que cambiaron, con su antes y su después", () => {
    const cambios = diferenciasDeCampos(campos(), campos({ nombre: "Ana P. Ruiz", cantidad: "9997.00" }));
    expect(cambios).toEqual({
      nombre: { antes: "Ana Pérez", despues: "Ana P. Ruiz" },
      cantidad: { antes: "", despues: "9997.00" },
    });
  });

  it("sin cambios devuelve un objeto vacío", () => {
    expect(diferenciasDeCampos(campos(), campos())).toEqual({});
  });

  it("si antes no había datos, lo trata como todo vacío", () => {
    const cambios = diferenciasDeCampos(null, campos());
    expect(cambios.folio).toEqual({ antes: "", despues: "4476" });
    expect(cambios.lada).toEqual({ antes: "", despues: "+52" });
  });
});

describe("ETIQUETA_ACCION", () => {
  it("tiene un texto para cada acción", () => {
    const acciones: AccionAuditoria[] = ["evento_creado", "evento_guardado_drive", "evento_cerrado", "evento_cerrado_auto", "evento_reabierto", "evento_borrado", "hoja_confirmada", "hoja_corregida"];
    for (const a of acciones) expect(ETIQUETA_ACCION[a]).toBeTruthy();
  });
});

describe("lineasDeDetalle", () => {
  it("evento creado: fecha en dd/mm/aaaa y origen de las fotos", () => {
    expect(lineasDeDetalle(registro("evento_creado", { fecha: "2026-10-28", origen: "local" }))).toEqual([
      "Fecha del evento: 28/10/2026",
      "Fotos subidas desde la computadora",
    ]);
  });

  it("evento borrado: motivo y resumen de hojas (con singular)", () => {
    expect(lineasDeDetalle(registro("evento_borrado", { motivo: "duplicado", hojas: 3, confirmadas: 2 }))).toEqual(["Motivo: duplicado", "Tenía 3 hojas (2 confirmadas)"]);
    expect(lineasDeDetalle(registro("evento_borrado", { motivo: "x", hojas: 1 }))).toEqual(["Motivo: x", "Tenía 1 hoja"]);
  });

  it("evento reabierto: motivo", () => {
    expect(lineasDeDetalle(registro("evento_reabierto", { motivo: "falta una hoja" }))).toEqual(["Motivo: falta una hoja"]);
  });

  it("hoja confirmada: folio y aviso si se forzó un duplicado", () => {
    expect(lineasDeDetalle(registro("hoja_confirmada", { folio: "4476" }))).toEqual(["Folio 4476"]);
    expect(lineasDeDetalle(registro("hoja_confirmada", { folio: "4476", duplicadoForzado: true }))).toEqual([
      "Folio 4476",
      "Se confirmó aunque el folio ya existía en otro evento",
    ]);
  });

  it("hoja corregida: folio y cada campo cambiado con su etiqueta", () => {
    const lineas = lineasDeDetalle(registro("hoja_corregida", { folio: "4476", cambios: { telefono: { antes: "3311111111", despues: "3322222222" } } }));
    expect(lineas).toEqual(["Folio 4476", "Celular: «3311111111» → «3322222222»"]);
  });

  it("sin detalle o con una acción que no lo necesita, no devuelve nada", () => {
    expect(lineasDeDetalle(registro("evento_cerrado"))).toEqual([]);
    expect(lineasDeDetalle(registro("hoja_confirmada", null))).toEqual([]);
  });
});

describe("duracionLegible", () => {
  it("muestra segundos, minutos o horas según el tamaño", () => {
    expect(duracionLegible(6)).toBe("6 s");
    expect(duracionLegible(125)).toBe("2 min 5 s");
    expect(duracionLegible(3720)).toBe("1 h 2 min");
  });
});

describe("detalle de captura en hoja confirmada", () => {
  it("muestra inicio, fin, duración y cambios guardados", () => {
    const r = { ...registro("hoja_confirmada", { folio: "1", inicio: "2026-10-28T11:59:54.000Z", segundos: 6, guardados: 0 }) };
    const lineas = lineasDeDetalle(r).join("|");
    expect(lineas).toContain("Duración: 6 s");
    expect(lineas).toContain("Sin cambios guardados");
    expect(lineas).toMatch(/Inició .* · terminó /);
  });

  it("sin datos de inicio no agrega líneas de captura", () => {
    expect(lineasDeDetalle(registro("hoja_confirmada", { folio: "1" })).join("|")).not.toContain("Duración");
  });
});

describe("resumirCaptura", () => {
  const conf = (id: number, usuario: string, inicio: string, fin: string, segundos: number, guardados: number): RegistroAuditoria =>
    ({ ...registro("hoja_confirmada", { folio: String(id), inicio, segundos, guardados }), id, usuarioId: usuario, usuarioNombre: usuario, en: fin });

  it("agrupa por evento y persona con primer inicio, último fin, promedio y rápidas", () => {
    const filas = resumirCaptura([
      conf(3, "Ana", "2026-10-28T10:00:20.000Z", "2026-10-28T10:00:25.000Z", 5, 0),
      conf(2, "Ana", "2026-10-28T10:00:00.000Z", "2026-10-28T10:00:20.000Z", 20, 3),
      conf(1, "Luis", "2026-10-28T09:00:00.000Z", "2026-10-28T09:01:00.000Z", 60, 2),
    ]);
    const ana = filas.find((f) => f.usuario === "Ana")!;
    expect(ana).toMatchObject({ hojas: 2, inicio: "2026-10-28T10:00:00.000Z", fin: "2026-10-28T10:00:25.000Z", promedioSegundos: 13, rapidas: 1, sinCambios: 1, sinDatos: 0 });
    expect(SEGUNDOS_CAPTURA_RAPIDA).toBeGreaterThan(5);
    expect(filas).toHaveLength(2);
  });

  it("cuenta las hojas sin datos de inicio aparte y no las promedia", () => {
    const sin = { ...registro("hoja_confirmada", { folio: "9" }), id: 9 };
    const [f] = resumirCaptura([sin]);
    expect(f).toMatchObject({ hojas: 1, sinDatos: 1, promedioSegundos: null });
  });
});
