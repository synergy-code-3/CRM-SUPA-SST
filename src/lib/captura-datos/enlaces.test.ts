import { describe, expect, it } from "vitest";
import { urlArchivo, urlCarpeta, urlDuplicado, urlExcelEvento, urlFila, urlHoja } from "./enlaces";

describe("enlaces", () => {
  it("arma las URL de Drive", () => {
    expect(urlCarpeta("abc")).toBe("https://drive.google.com/drive/folders/abc");
    expect(urlArchivo("abc")).toBe("https://drive.google.com/file/d/abc/view");
    expect(urlHoja("abc")).toBe("https://docs.google.com/spreadsheets/d/abc/edit");
    expect(urlExcelEvento("a b")).toBe("/api/captura-datos/eventos/a%20b/excel");
  });

  it("urlFila apunta a la fila solo si hay gid", () => {
    expect(urlFila("https://x/edit#gid=1", 7, 5)).toBe("https://x/edit#gid=5&range=A7");
    expect(urlFila("https://x/edit", 7)).toBe("https://x/edit");
  });

  it("urlDuplicado prefiere Drive, luego el Excel, o nada", () => {
    const base = { eventoId: "e1", fila: 3, id: "h1" };
    expect(urlDuplicado({ ...base, hojaUrl: "https://x/edit", gid: 2 })?.texto).toBe("Ver en Drive");
    expect(urlDuplicado({ ...base, excel: true })?.texto).toBe("Descargar ese Excel");
    expect(urlDuplicado(base)).toBeNull();
  });
});
