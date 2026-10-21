import { describe, expect, it } from "vitest";
import { idDeEnlace, neutralizarFormula } from "./google";

describe("neutralizarFormula", () => {
  it("antepone un apóstrofo a lo que empieza como fórmula", () => {
    for (const t of ["=HYPERLINK(\"http://x\")", "+1+1", "-2", "@SUM(A1)"]) expect(neutralizarFormula(t)).toBe(`'${t}`);
  });

  it("deja igual el texto normal y el vacío", () => {
    expect(neutralizarFormula("Pago a meses")).toBe("Pago a meses");
    expect(neutralizarFormula("")).toBe("");
  });
});

describe("idDeEnlace", () => {
  it("saca el id de un enlace de carpeta o acepta el id solo", () => {
    expect(idDeEnlace("https://drive.google.com/drive/u/1/folders/1w1nhREInIc7NGezEPg3l_-q1f9mkvqSG")).toBe("1w1nhREInIc7NGezEPg3l_-q1f9mkvqSG");
    expect(idDeEnlace("1w1nhREInIc7NGezEPg3l_-q1f9mkvqSG")).toBe("1w1nhREInIc7NGezEPg3l_-q1f9mkvqSG");
  });

  it("rechaza lo que no parece un enlace de Drive", () => {
    expect(idDeEnlace("hola")).toBeNull();
    expect(idDeEnlace("https://evil.com/x")).toBeNull();
  });
});
