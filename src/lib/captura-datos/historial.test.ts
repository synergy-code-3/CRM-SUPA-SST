import { describe, expect, it } from "vitest";
import { EMPTY_FIELDS, type SheetFields } from "./fields";
import { diferenciasDeCampos, ETIQUETA_ACCION, lineasDeDetalle, type AccionAuditoria, type RegistroAuditoria } from "./historial";

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
