import { describe, expect, it } from "vitest";
import { conciliar, mismaFicha, normalizarCorreo, normalizarNombre, telefonoConsultable, valorDeAxis } from "./conciliacion";
import { EMPTY_FIELDS } from "./fields";

describe("conciliacion con Axis", () => {
  it("normaliza nombres sin acentos, signos ni mayúsculas", () => {
    expect(normalizarNombre("MARÍA-José  Pérez")).toBe("maria jose perez");
    expect(normalizarCorreo(" Ana @Mail.COM ")).toBe("ana@mail.com");
  });

  it("marca ok, distinto y sin_dato", () => {
    const r = conciliar({ nombre: "Maria Jose Perez", correo: "otro@mail.com" }, { nombre: "María José Pérez", correo: "maria@mail.com" });
    expect(r).toEqual({ nombre: "ok", correo: "distinto" });
    expect(conciliar({ nombre: "Ana", correo: "a@b.co" }, { nombre: "", correo: "" })).toEqual({ nombre: "sin_dato", correo: "sin_dato" });
  });

  it("valorDeAxis aplica el mismo filtro que al teclear", () => {
    expect(valorDeAxis({ nombre: "Ana  Pérez 3", correo: "" }, "nombre")).toBe("Ana Pérez");
  });

  it("telefonoConsultable solo con 10 dígitos", () => {
    expect(telefonoConsultable({ lada: "+52", telefono: "3312345678" })).toBe("3312345678");
    expect(telefonoConsultable({ lada: "+52", telefono: "33123" })).toBeNull();
    expect(telefonoConsultable({ lada: "+52", telefono: "5213312345678" })).toBe("3312345678");
  });

  it("mismaFicha exige folio, teléfono y nombre iguales", () => {
    const a = { ...EMPTY_FIELDS, folio: "44", telefono: "3312345678", nombre: "Ana Lopez" };
    expect(mismaFicha(a, { ...a, nombre: "ANA LÓPEZ" })).toBe(true);
    expect(mismaFicha(a, { ...a, telefono: "3300000000" })).toBe(false);
    expect(mismaFicha({ ...a, folio: "" }, { ...a, folio: "" })).toBe(false);
  });
});
