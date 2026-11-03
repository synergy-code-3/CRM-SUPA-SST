import { describe, expect, it } from "vitest";
import { decodificar, correosDeCliente, hojaPerteneceACliente, telefonoDe10 } from "./cliente-hojas";

const cliente = { id: "viejo@x.com", email: "Nuevo@X.com", telefono: "+5215512345678" };
const hoja = (campos: object | null, estado = "confirmada") => ({ estado, campos }) as never;

describe("telefonoDe10", () => {
  it("toma los últimos 10 dígitos con o sin lada y símbolos", () => {
    expect(telefonoDe10("+5215512345678")).toBe("5512345678");
    expect(telefonoDe10("55 1234-5678")).toBe("5512345678");
  });
  it("null si hay menos de 10 dígitos o no hay teléfono", () => {
    expect(telefonoDe10("12345")).toBeNull();
    expect(telefonoDe10(null)).toBeNull();
  });
});

describe("correosDeCliente", () => {
  it("devuelve el correo actual y el id original, en minúsculas y sin repetir", () => {
    expect(correosDeCliente(cliente)).toEqual(["nuevo@x.com", "viejo@x.com"]);
    expect(correosDeCliente({ id: "a@x.com", email: "A@x.com", telefono: null })).toEqual(["a@x.com"]);
  });
});

describe("decodificar", () => {
  it("decodifica y tolera un % mal formado", () => {
    expect(decodificar("a%40x.com")).toBe("a@x.com");
    expect(decodificar("%E0%A4%A")).toBe("");
  });
});

describe("correosDeCliente (seguridad)", () => {
  it("descarta correos con comas, comillas, paréntesis o barras", () => {
    expect(correosDeCliente({ id: 'x@y","a@b.com', email: "a,b@x.com", telefono: null })).toEqual([]);
    expect(correosDeCliente({ id: "a(b)@x.com", email: 'a"@x.com', telefono: null })).toEqual([]);
  });
});

describe("hojaPerteneceACliente", () => {
  it("coincide por correo", () => {
    expect(hojaPerteneceACliente(hoja({ correo: "nuevo@x.com", telefono: "" }), cliente)).toBe(true);
  });
  it("coincide por teléfono", () => {
    expect(hojaPerteneceACliente(hoja({ correo: "otro@x.com", telefono: "5512345678" }), cliente)).toBe(true);
  });
  it("no coincide con datos de otra persona", () => {
    expect(hojaPerteneceACliente(hoja({ correo: "otro@x.com", telefono: "5599999999" }), cliente)).toBe(false);
  });
  it("teléfono vacío en la hoja y en el cliente no cuenta como coincidencia", () => {
    expect(hojaPerteneceACliente(hoja({ correo: "", telefono: "" }), { ...cliente, telefono: null, email: "z@x.com", id: "z@x.com" })).toBe(false);
  });
  it("solo hojas confirmadas", () => {
    expect(hojaPerteneceACliente(hoja({ correo: "nuevo@x.com", telefono: "" }, "pendiente"), cliente)).toBe(false);
  });
  it("hoja sin campos no coincide", () => {
    expect(hojaPerteneceACliente(hoja(null), cliente)).toBe(false);
  });
});
