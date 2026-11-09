import { describe, expect, it } from "vitest";
import { htmlInforme } from "./pdf-captura";
import type { HojaDeCaptura } from "./historial";

const hoja = (sobre: Partial<HojaDeCaptura> = {}): HojaDeCaptura => ({
  hojaId: "h1", folio: "4476", inicio: "2026-10-28T11:59:54.000Z", fin: "2026-10-28T12:00:00.000Z", segundos: 6, guardados: 0, rapida: true, sinCambios: true, desdeAnteriorSegundos: null, foto: "IMG_1.jpg", tipo: "confirmada", ...sobre,
});

describe("htmlInforme", () => {
  it("incluye a la persona, las alertas y el resumen", () => {
    const html = htmlInforme({ usuario: "Ana", evento: "Evento", periodo: "Todo", hojas: [hoja()] });
    expect(html).toContain("Reporte de captura: Ana");
    expect(html).toContain("IMG_1.jpg");
    expect(html).toContain("Muy rápida, Sin cambios");
    expect(html).toContain("Muy rápidas (menos de 15 s): 1");
  });

  it("escapa el HTML de nombres y fotos", () => {
    const html = htmlInforme({ usuario: "<script>x</script>", evento: "E", periodo: "P", hojas: [hoja({ foto: '"><img src=x>' })] });
    expect(html).not.toContain("<script>x");
    expect(html).not.toContain('"><img');
  });

  it("marca las hojas sin medición", () => {
    const html = htmlInforme({ usuario: "Ana", evento: "E", periodo: "P", hojas: [hoja({ inicio: null, segundos: null, guardados: null, rapida: false, sinCambios: false })] });
    expect(html).toContain("Sin medición");
  });
});
