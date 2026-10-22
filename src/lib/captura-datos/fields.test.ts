import { describe, expect, it } from "vitest";
import {
  EMPTY_FIELDS, camposRequeridos, compararPago, normalizeCantidad, normalizeFields, normalizeFolio, parseCantidad,
  requiereTarjeta, sanitizeInput, splitTelefono, validateFields, whatsappLink, type SheetFields,
} from "./fields";

const completa: SheetFields = {
  folio: "4476", nombre: "María José Pérez", correo: "maria@gmail.com", lada: "+52", telefono: "3312345678",
  tarjeta: "1234", marcaTarjeta: "Visa", metodoPago: "Tarjeta", cantidad: "9997", membresia: "3 Meses", notas: "",
};

describe("validateFields", () => {
  it("acepta una hoja Completo con todos los datos", () => {
    expect(validateFields(completa, "Completo")).toEqual({});
  });

  it("exige la membresía en Completo pero no en Apartado", () => {
    const sinMembresia = { ...completa, membresia: "" };
    expect(validateFields(sinMembresia, "Completo").membresia).toBeDefined();
    expect(validateFields(sinMembresia, "Apartado").membresia).toBeUndefined();
  });

  it("en Interesado solo pide folio y datos de contacto", () => {
    const interesado = { ...EMPTY_FIELDS, folio: "12", nombre: "Ana Lopez", correo: "ana@mail.com", telefono: "3312345678" };
    expect(validateFields(interesado, "Interesado")).toEqual({});
  });

  it("reporta cada campo faltante", () => {
    const errores = validateFields(EMPTY_FIELDS, "Completo");
    expect(Object.keys(errores)).toEqual(expect.arrayContaining(["folio", "telefono", "nombre", "correo", "metodoPago", "cantidad", "membresia"]));
  });

  it("rechaza teléfono de menos de 10 dígitos y correo mal formado", () => {
    const errores = validateFields({ ...completa, telefono: "331234", correo: "no-es-correo" });
    expect(errores.telefono).toMatch(/10 dígitos/);
    expect(errores.correo).toBeDefined();
  });

  it("pide los 4 dígitos solo si el método incluye tarjeta", () => {
    expect(validateFields({ ...completa, tarjeta: "" }).tarjeta).toBeDefined();
    expect(validateFields({ ...completa, metodoPago: "Efectivo", tarjeta: "" }).tarjeta).toBeUndefined();
  });

  it("rechaza nombres con números o demasiado cortos", () => {
    expect(validateFields({ ...completa, nombre: "Ana 3" }).nombre).toBeDefined();
    expect(validateFields({ ...completa, nombre: "Al" }).nombre).toBeDefined();
  });

  it("rechaza cantidades inválidas", () => {
    expect(validateFields({ ...completa, cantidad: "0" }).cantidad).toBeDefined();
    expect(validateFields({ ...completa, cantidad: "12.345" }).cantidad).toBeDefined();
  });
});

describe("camposRequeridos", () => {
  it("cambia según estatus y método de pago", () => {
    expect(camposRequeridos(completa, "Interesado")).toEqual(["folio", "telefono", "nombre", "correo"]);
    expect(camposRequeridos(completa, "Completo")).toContain("tarjeta");
    expect(camposRequeridos(completa, "Completo")).toContain("membresia");
    expect(camposRequeridos(completa, "Apartado")).not.toContain("membresia");
    expect(camposRequeridos({ ...completa, metodoPago: "Efectivo" }, "Completo")).not.toContain("tarjeta");
  });
});

describe("sanitizeInput", () => {
  it("filtra caracteres inválidos por campo", () => {
    expect(sanitizeInput("folio", "12ab34567890")).toBe("12345678");
    expect(sanitizeInput("telefono", "33-1234 5678 99")).toBe("3312345678");
    expect(sanitizeInput("tarjeta", "12345")).toBe("1234");
    expect(sanitizeInput("nombre", "Ana  3 Pérez!")).toBe("Ana Pérez");
    expect(sanitizeInput("correo", " A B@Mail.COM ")).toBe("ab@mail.com");
    expect(sanitizeInput("cantidad", "9,997.5099")).toBe("9997.50");
  });
});

describe("normalizadores", () => {
  it("normalizeFolio quita ceros a la izquierda y no dígitos", () => {
    expect(normalizeFolio("N° 0044")).toBe("44");
    expect(normalizeFolio("0")).toBe("0");
  });

  it("splitTelefono separa la lada pegada", () => {
    expect(splitTelefono("+52", "5213312345678")).toEqual({ lada: "+52", telefono: "3312345678" });
    expect(splitTelefono("+52", "523312345678")).toEqual({ lada: "+52", telefono: "3312345678" });
    expect(splitTelefono("+52", "13312345678")).toEqual({ lada: "+1", telefono: "3312345678" });
    expect(splitTelefono("+1", "3312345678")).toEqual({ lada: "+1", telefono: "3312345678" });
  });

  it("parseCantidad y normalizeCantidad", () => {
    expect(parseCantidad("$9,997.50")).toBe(9997.5);
    expect(parseCantidad("abc")).toBeNull();
    expect(normalizeCantidad("9997.00")).toBe("9997");
  });

  it("normalizeFields limpia datos y vacía el pago en Interesado", () => {
    const sucia = { ...completa, nombre: "  Ana   Lopez ", correo: " ANA@Mail.com ", folio: "0044" };
    expect(normalizeFields(sucia)).toMatchObject({ nombre: "Ana Lopez", correo: "ana@mail.com", folio: "44" });
    expect(normalizeFields(completa, "Interesado")).toMatchObject({ metodoPago: "", cantidad: "", membresia: "", tarjeta: "" });
  });

  it("normalizeFields descarta valores fuera de catálogo", () => {
    expect(normalizeFields({ ...completa, metodoPago: "Trueque", membresia: "7 Meses", marcaTarjeta: "visa" })).toMatchObject({
      metodoPago: "", membresia: "", marcaTarjeta: "Visa",
    });
  });
});

describe("otros", () => {
  it("requiereTarjeta", () => {
    expect(requiereTarjeta("Trans/Tarjeta")).toBe(true);
    expect(requiereTarjeta("Efectivo")).toBe(false);
  });

  it("whatsappLink arma el enlace sin símbolos", () => {
    expect(whatsappLink("+52", "3312345678")).toContain("523312345678");
  });

  it("compararPago devuelve null si no hay datos suficientes", () => {
    expect(compararPago(EMPTY_FIELDS)).toBeNull();
  });
});
