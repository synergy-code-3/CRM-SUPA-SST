import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  siguientesHojasLibres: vi.fn(),
  reclamarLecturaIa: vi.fn(),
  devolverLecturaIa: vi.fn(),
  guardarLecturaAdelantada: vi.fn(),
  marcarHojaNoValida: vi.fn(),
  esNoValida: vi.fn(),
}));
vi.mock("./db", () => db);

const extract = vi.hoisted(() => ({ extractFromImage: vi.fn() }));
vi.mock("./extract", () => extract);

const google = vi.hoisted(() => ({ descargarArchivo: vi.fn() }));
vi.mock("./google", () => google);

vi.mock("@/lib/storage", () => ({ leerFotoHoja: vi.fn() }));

import { adelantarLecturas, datosDeExtraccion } from "./lectura-ia";

function hoja(id: string, sobreescribir: Record<string, unknown> = {}) {
  return { id, eventoId: "e1", estatus: "Completo", origen: { nombreOriginal: `${id}.jpg`, driveId: `drive-${id}` }, estado: "pendiente", ...sobreescribir };
}

const LEIDA = {
  esHojaDeRegistro: true, motivoNoHoja: "", tieneVoucher: false, voucherBox: null,
  folio: "4476", nombre: "Ana", correo: "a@b.com", lada: "+52", telefono: "3312345678",
  metodoPago: "", tarjeta: "", marcaTarjeta: "", cantidad: "9997.00", membresia: "", notas: "",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  google.descargarArchivo.mockResolvedValue({ base64: "QUJD", mime: "image/jpeg" });
  db.esNoValida.mockResolvedValue(false);
  db.reclamarLecturaIa.mockResolvedValue(true);
  db.guardarLecturaAdelantada.mockResolvedValue(true);
  db.devolverLecturaIa.mockResolvedValue(undefined);
  db.marcarHojaNoValida.mockResolvedValue(undefined);
  extract.extractFromImage.mockResolvedValue(LEIDA);
});

describe("adelantarLecturas", () => {
  it("lee solo las hojas pendientes y sin lectura previa de la ventana", async () => {
    db.siguientesHojasLibres.mockResolvedValue([
      hoja("a"),
      hoja("b", { origen: { nombreOriginal: "b.jpg", driveId: "drive-b", leidaIa: true } }),
      hoja("c", { estado: "leida" }),
    ]);
    await adelantarLecturas("e1", 3);
    expect(db.siguientesHojasLibres).toHaveBeenCalledWith("e1", 3);
    expect(extract.extractFromImage).toHaveBeenCalledTimes(1);
    expect(db.guardarLecturaAdelantada).toHaveBeenCalledWith("a", expect.any(Object), null, expect.any(Object));
  });

  it("completa la membresía por el monto cuando la IA no la marcó", async () => {
    db.siguientesHojasLibres.mockResolvedValue([hoja("a")]);
    await adelantarLecturas("e1", 1);
    const guardados = db.guardarLecturaAdelantada.mock.calls[0][1];
    expect(guardados.membresia).toBe("3 Meses");
    expect(guardados.folio).toBe("4476");
  });

  it("si la IA falla devuelve la lectura, no sigue con las demás y no lanza", async () => {
    db.siguientesHojasLibres.mockResolvedValue([hoja("a"), hoja("b")]);
    extract.extractFromImage.mockRejectedValue(new Error("Gemini 503"));
    await expect(adelantarLecturas("e1", 2)).resolves.toBeUndefined();
    expect(extract.extractFromImage).toHaveBeenCalledTimes(1);
    expect(db.devolverLecturaIa).toHaveBeenCalledWith("a", expect.any(Object));
    expect(db.guardarLecturaAdelantada).not.toHaveBeenCalled();
  });

  it("si otra lectura ya reclamó la hoja, no gasta la IA", async () => {
    db.siguientesHojasLibres.mockResolvedValue([hoja("a")]);
    db.reclamarLecturaIa.mockResolvedValue(false);
    await adelantarLecturas("e1", 1);
    expect(extract.extractFromImage).not.toHaveBeenCalled();
  });

  it("marca como no válida una imagen que no es hoja de registro y no guarda datos", async () => {
    db.siguientesHojasLibres.mockResolvedValue([hoja("a")]);
    extract.extractFromImage.mockResolvedValue({ ...LEIDA, esHojaDeRegistro: false, motivoNoHoja: "es un ticket" });
    await adelantarLecturas("e1", 1);
    expect(db.marcarHojaNoValida).toHaveBeenCalledWith("a", expect.any(String));
    expect(db.guardarLecturaAdelantada).not.toHaveBeenCalled();
  });

  it("no lee una imagen cuya huella ya se marcó como no válida", async () => {
    db.siguientesHojasLibres.mockResolvedValue([hoja("a")]);
    db.esNoValida.mockResolvedValue(true);
    await adelantarLecturas("e1", 1);
    expect(db.marcarHojaNoValida).toHaveBeenCalled();
    expect(extract.extractFromImage).not.toHaveBeenCalled();
  });

  it("si alguien guardó la hoja mientras la IA leía, no la pisa y devuelve la lectura", async () => {
    db.siguientesHojasLibres.mockResolvedValue([hoja("a")]);
    db.guardarLecturaAdelantada.mockResolvedValue(false);
    await adelantarLecturas("e1", 1);
    expect(db.devolverLecturaIa).toHaveBeenCalledWith("a", expect.any(Object));
  });

  it("no lanza aunque falle la consulta de hojas", async () => {
    db.siguientesHojasLibres.mockRejectedValue(new Error("db caída"));
    await expect(adelantarLecturas("e1", 2)).resolves.toBeUndefined();
  });
});

describe("datosDeExtraccion", () => {
  it("separa la caja del voucher y quita los campos de control", () => {
    const caja = { x: 0.6, y: 0, w: 0.3, h: 0.3 };
    const { campos, voucherBox } = datosDeExtraccion({ ...LEIDA, tieneVoucher: true, voucherBox: caja } as never);
    expect(voucherBox).toEqual(caja);
    expect(campos).not.toHaveProperty("esHojaDeRegistro");
    expect(campos).not.toHaveProperty("tieneVoucher");
    expect(campos).toMatchObject({ folio: "4476", nombre: "Ana" });
  });
});
