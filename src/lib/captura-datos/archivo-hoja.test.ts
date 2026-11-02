import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ leerFotoHoja: vi.fn(), urlFirmadaFotoHoja: vi.fn(), descargarArchivo: vi.fn() }));
vi.mock("@/lib/storage", () => ({ leerFotoHoja: m.leerFotoHoja, urlFirmadaFotoHoja: m.urlFirmadaFotoHoja }));
vi.mock("./google", () => ({ descargarArchivo: m.descargarArchivo }));

import { respuestaArchivoHoja } from "./archivo-hoja";

const hoja = (origen: object) => ({ id: "h1", folio: "123", origen }) as never;
beforeEach(() => vi.resetAllMocks());

describe("respuestaArchivoHoja", () => {
  it("PDF de Storage: se sirve inline con cabeceras seguras", async () => {
    m.leerFotoHoja.mockResolvedValue(Buffer.from("pdf"));
    const r = await respuestaArchivoHoja(hoja({ nombreOriginal: "a.pdf", rutaStorage: "x/a.pdf" }), false);
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("application/pdf");
    expect(r.headers.get("Content-Disposition")).toBe('inline; filename="hoja-123.pdf"');
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("foto de Storage sin descargar: redirige a la URL firmada", async () => {
    m.urlFirmadaFotoHoja.mockResolvedValue("https://firmada/x");
    const r = await respuestaArchivoHoja(hoja({ nombreOriginal: "a.jpg", rutaStorage: "x/a.jpg" }), false);
    expect(r.status).toBe(307);
    expect(r.headers.get("Location")).toBe("https://firmada/x");
  });

  it("foto de Storage al descargar: bytes con attachment y extensión del tipo", async () => {
    m.leerFotoHoja.mockResolvedValue(Buffer.from("img"));
    const r = await respuestaArchivoHoja(hoja({ nombreOriginal: "a.png", rutaStorage: "x/a.png" }), true);
    expect(r.headers.get("Content-Type")).toBe("image/png");
    expect(r.headers.get("Content-Disposition")).toBe('attachment; filename="hoja-123.png"');
  });

  it("archivo de Drive: sirve el tipo que devuelve Drive", async () => {
    m.descargarArchivo.mockResolvedValue({ base64: Buffer.from("j").toString("base64"), mime: "image/jpeg" });
    const r = await respuestaArchivoHoja(hoja({ nombreOriginal: "a.jpg", driveId: "d1" }), true);
    expect(r.headers.get("Content-Disposition")).toBe('attachment; filename="hoja-123.jpg"');
  });

  it("415 si Drive devuelve un tipo no permitido (html/svg)", async () => {
    m.descargarArchivo.mockResolvedValue({ base64: "", mime: "image/svg+xml" });
    const r = await respuestaArchivoHoja(hoja({ nombreOriginal: "a.svg", driveId: "d1" }), false);
    expect(r.status).toBe(415);
  });

  it("404 si no hay archivo asociado o Storage no lo encuentra", async () => {
    expect((await respuestaArchivoHoja(hoja({ nombreOriginal: "a.jpg" }), false)).status).toBe(404);
    m.leerFotoHoja.mockResolvedValue(null);
    expect((await respuestaArchivoHoja(hoja({ nombreOriginal: "a.pdf", rutaStorage: "x.pdf" }), false)).status).toBe(404);
  });

  it("403 para un PDF de varias hojas (traería hojas de otras personas), en Storage y en Drive", async () => {
    m.leerFotoHoja.mockResolvedValue(Buffer.from("p"));
    expect((await respuestaArchivoHoja(hoja({ nombreOriginal: "l.pdf", rutaStorage: "l.pdf", paginas: 8 }), false)).status).toBe(403);
    m.descargarArchivo.mockResolvedValue({ base64: "", mime: "application/pdf" });
    expect((await respuestaArchivoHoja(hoja({ nombreOriginal: "l.pdf", driveId: "d", paginas: 8 }), true)).status).toBe(403);
    expect((await respuestaArchivoHoja(hoja({ nombreOriginal: "l.pdf", rutaStorage: "l.pdf", paginas: 1 }), false)).status).toBe(200);
  });

  it("las respuestas no se guardan en caché", async () => {
    m.leerFotoHoja.mockResolvedValue(Buffer.from("p"));
    expect((await respuestaArchivoHoja(hoja({ nombreOriginal: "a.pdf", rutaStorage: "a.pdf" }), false)).headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("el nombre de descarga solo lleva dígitos del folio", async () => {
    m.leerFotoHoja.mockResolvedValue(Buffer.from("p"));
    const r = await respuestaArchivoHoja({ id: "h1", folio: '1"\r\nX: y', origen: { nombreOriginal: "a.pdf", rutaStorage: "a.pdf" } } as never, true);
    expect(r.headers.get("Content-Disposition")).toBe('attachment; filename="hoja-1.pdf"');
  });
});
