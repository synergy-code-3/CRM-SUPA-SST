// Tipos y validaciones compartidos entre el cliente y el servidor.

// "pais" es lo que se escribe en la columna LADA; el número (+52/+1) va en TELEFONO y en el link de WhatsApp.
export const LADAS = [
  { value: "+52", pais: "MX", label: "🇲🇽 MX +52" },
  { value: "+1", pais: "USA", label: "🇺🇸 USA +1" },
] as const;
export type Lada = (typeof LADAS)[number]["value"];

// Mismas opciones que la lista desplegable de MET PAGO en la plantilla del Sheet.
export const METODOS_PAGO = [
  "Tarjeta", "Efectivo", "Transferencia", "Trans/Tarjeta", "Stripe", "Hotmart", "Beca", "Mercado pago",
  "Efectivo/Transferencia", "Tarjeta/Efectivo", "Crypto", "QR", "ZELLE", "Klarna", "Afterpay", "Tarjeta/Zelle", "Kajabi",
] as const;

// Marca de la tarjeta, como aparece en el voucher. Se guarda en la misma celda de #Tarjeta: "Visa 4821".
export const MARCAS_TARJETA = ["Visa", "Mastercard", "American Express", "Carnet"] as const;
export type MarcaTarjeta = (typeof MARCAS_TARJETA)[number];

// "value" es el texto que se escribe en la columna TIPO DE MEMBRESIA del Sheet.
// fondo/texto: colores de la celda (los mismos que tenían las opciones de la lista en el Sheet original).
// Si los cambias, cámbialos también en MEMBRESIAS_COLORES de google-apps-script/Codigo.gs.
export const MEMBRESIAS = [
  { value: "3 Meses", precio: 9997, precioAMeses: 11396.58, detalle: "$9,997 · 3 meses", fondo: "D3ECBB", texto: "1F1F1F" },
  { value: "6 Meses", precio: 12997, precioAMeses: 14816.58, detalle: "$12,997 · 1 año de club + 6 meses de acompañamiento", fondo: "18724C", texto: "FFFFFF" },
  { value: "12 Meses", precio: 14997, precioAMeses: 18448.92, detalle: "$14,997 · 1 año de club + 1 año de acompañamiento", fondo: "1254A7", texto: "FFFFFF" },
] as const;

// Estado del escaneo: sale de la subcarpeta de Drive (o se elige al subir desde la computadora).
export const ESTATUS = [
  { value: "Completo", carpeta: "Completos", desc: "Pago completo: todos los datos son obligatorios." },
  { value: "Apartado", carpeta: "Apartados", desc: "Anticipo: todo obligatorio salvo el tipo de membresía." },
  { value: "Interesado", carpeta: "Interesados", desc: "Solo folio y datos de contacto; sin pagos ni membresía." },
] as const;
export type Estatus = (typeof ESTATUS)[number]["value"];
export type Carpeta = (typeof ESTATUS)[number]["carpeta"];

export const estatusDeCarpeta = (carpeta: string): Estatus | undefined =>
  ESTATUS.find((e) => e.carpeta === carpeta)?.value;
export const carpetaDeEstatus = (estatus: Estatus): Carpeta => ESTATUS.find((e) => e.value === estatus)!.carpeta;

/** Interesados no llevan pago, voucher ni membresía. */
export const llevaPago = (estatus: Estatus) => estatus !== "Interesado";

export interface SheetFields {
  folio: string;
  nombre: string;
  correo: string;
  lada: Lada;
  telefono: string; // 10 dígitos, sin lada
  tarjeta: string; // últimos 4 dígitos
  marcaTarjeta: string; // "" o una de MARCAS_TARJETA; opcional
  metodoPago: string;
  cantidad: string;
  membresia: string;
  notas: string; // opcional, va a la columna NOTAS
}

export type FieldKey = keyof SheetFields;

/** Recuadro normalizado (0–1) relativo a la imagen completa. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Extraction extends SheetFields {
  /** false si la imagen no es una hoja de inscripción del Club: nunca se puede guardar. */
  esHojaDeRegistro: boolean;
  motivoNoHoja: string;
  tieneVoucher: boolean;
  voucherBox: Box | null;
}

export const EMPTY_FIELDS: SheetFields = {
  folio: "", nombre: "", correo: "", lada: "+52", telefono: "",
  tarjeta: "", marcaTarjeta: "", metodoPago: "", cantidad: "", membresia: "", notas: "",
};

export const NOTAS_MAX = 500;

/** El número de tarjeta solo se pide si el método de pago incluye tarjeta. */
export function requiereTarjeta(metodoPago: string): boolean {
  return /tarjeta/i.test(metodoPago);
}

/**
 * Filtra lo que se escribe en cada campo (no deja teclear caracteres inválidos).
 * La validación completa ocurre en validateFields.
 */
export function sanitizeInput(key: FieldKey, value: string): string {
  switch (key) {
    case "folio":
      return value.replace(/\D/g, "").slice(0, 8);
    case "telefono":
      return value.replace(/\D/g, "").slice(0, 10);
    case "tarjeta":
      return value.replace(/\D/g, "").slice(0, 4);
    case "cantidad": {
      // Solo dígitos y un punto decimal con máximo 2 decimales
      const [ent, ...rest] = value.replace(/[^\d.]/g, "").split(".");
      const dec = rest.join("").slice(0, 2);
      return rest.length ? `${ent.slice(0, 7)}.${dec}` : ent.slice(0, 7);
    }
    case "nombre":
      // Letras (con acentos), espacios, apóstrofo, guion y punto; sin números ni símbolos
      return value.replace(/[^\p{L}\p{M} .'-]/gu, "").replace(/\s{2,}/g, " ").slice(0, 80);
    case "correo":
      return value.replace(/\s/g, "").toLowerCase().replace(/[^a-z0-9._%+\-@]/g, "").slice(0, 80);
    case "notas":
      return value.slice(0, NOTAS_MAX);
    default:
      return value;
  }
}

export function normalizeFolio(v: string): string {
  return v.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

/** Separa la lada si vino pegada al número (52…, 521…, 1…) y deja solo los 10 dígitos. */
export function splitTelefono(lada: Lada, raw: string): { lada: Lada; telefono: string } {
  const d = raw.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("521")) return { lada: "+52", telefono: d.slice(3) };
  if (d.length === 12 && d.startsWith("52")) return { lada: "+52", telefono: d.slice(2) };
  if (d.length === 11 && d.startsWith("1")) return { lada: "+1", telefono: d.slice(1) };
  return { lada, telefono: d };
}

export function normalizeCantidad(v: string): string {
  const n = parseCantidad(v);
  return n === null ? "" : String(n);
}

export function parseCantidad(v: string): number | null {
  const clean = v.replace(/[^\d.]/g, "");
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function normalizeFields(f: SheetFields, estatus: Estatus = "Completo"): SheetFields {
  const lada: Lada = LADAS.some((l) => l.value === f.lada) ? f.lada : "+52";
  const n = normalizeTodo(f, lada);
  // Para interesados no se guarda nada de pago aunque la IA lo haya leído
  return llevaPago(estatus) ? n : { ...n, tarjeta: "", marcaTarjeta: "", metodoPago: "", cantidad: "", membresia: "" };
}

function normalizeTodo(f: SheetFields, lada: Lada): SheetFields {
  return {
    folio: normalizeFolio(f.folio),
    nombre: f.nombre.replace(/\s+/g, " ").trim(),
    correo: f.correo.replace(/\s+/g, "").toLowerCase(),
    ...splitTelefono(lada, f.telefono),
    tarjeta: f.tarjeta.replace(/\D/g, "").slice(-4),
    marcaTarjeta: marcaValida(f.marcaTarjeta),
    metodoPago: (METODOS_PAGO as readonly string[]).includes(f.metodoPago) ? f.metodoPago : "",
    cantidad: normalizeCantidad(f.cantidad),
    membresia: MEMBRESIAS.some((m) => m.value === f.membresia) ? f.membresia : "",
    notas: conNotaAMeses({ cantidad: normalizeCantidad(f.cantidad), notas: (f.notas ?? "").replace(/\r/g, "").trim() }).slice(0, NOTAS_MAX),
  };
}

/** La marca tal como está en MARCAS_TARJETA (sin importar mayúsculas), o "" si no es una conocida. */
export function marcaValida(v: string | undefined): string {
  return MARCAS_TARJETA.find((m) => m.toLowerCase() === (v ?? "").trim().toLowerCase()) ?? "";
}

/** Lo que va en la celda #Tarjeta: "Visa 4821" (o solo la marca o solo los 4 dígitos si falta uno). */
export const celdaTarjeta = (f: Pick<SheetFields, "marcaTarjeta" | "tarjeta">): string =>
  [f.marcaTarjeta, f.tarjeta].filter(Boolean).join(" ");

export const NOTA_A_MESES = "Pago a meses";

/** Si la cantidad es uno de los precios a meses, las notas dicen que el pago es a meses (sin repetirlo). */
export function conNotaAMeses({ cantidad, notas }: { cantidad: string; notas: string }): string {
  const pagado = parseCantidad(cantidad);
  const esAMeses = pagado !== null && MEMBRESIAS.some((m) => Math.abs(pagado - m.precioAMeses) < 0.01);
  if (!esAMeses || /a meses/i.test(notas)) return notas;
  return notas ? `${notas}. ${NOTA_A_MESES}` : NOTA_A_MESES;
}

/**
 * Errores bloqueantes por campo, según el estado:
 *  - Completo: todo obligatorio (salvo notas).
 *  - Apartado: todo obligatorio salvo la membresía (a veces cambian de plan y pagan la diferencia).
 *  - Interesado: solo folio y datos de contacto.
 */
export function validateFields(f: SheetFields, estatus: Estatus = "Completo"): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};

  if (!f.folio) errors.folio = "Falta el folio";
  else if (!/^\d{1,8}$/.test(f.folio)) errors.folio = "El folio solo lleva números";

  const tel = f.telefono;
  if (!tel) errors.telefono = "Falta el teléfono";
  else if (!/^\d{10}$/.test(tel)) errors.telefono = `El número lleva 10 dígitos sin la lada (tiene ${tel.replace(/\D/g, "").length})`;
  if (!LADAS.some((l) => l.value === f.lada)) errors.lada = "Elige la lada";

  const nombre = f.nombre.trim();
  if (!nombre) errors.nombre = "Falta el nombre";
  else if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(nombre)) errors.nombre = "El nombre solo lleva letras";
  else if (nombre.replace(/[^\p{L}]/gu, "").length < 3) errors.nombre = "Nombre demasiado corto";

  const correo = f.correo.trim();
  if (!correo) errors.correo = "Falta el correo";
  else if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(correo)) errors.correo = "Correo con formato inválido";

  if ((f.notas ?? "").length > NOTAS_MAX) errors.notas = `Máximo ${NOTAS_MAX} caracteres`;
  if (!llevaPago(estatus)) return errors;

  if (!(METODOS_PAGO as readonly string[]).includes(f.metodoPago)) errors.metodoPago = "Elige el método de pago";

  if (requiereTarjeta(f.metodoPago)) {
    if (!f.tarjeta) errors.tarjeta = "Faltan los últimos 4 dígitos";
    else if (!/^\d{4}$/.test(f.tarjeta)) errors.tarjeta = "Deben ser 4 dígitos";
  } else if (f.tarjeta && !/^\d{4}$/.test(f.tarjeta)) errors.tarjeta = "Deben ser 4 dígitos";

  const cantidad = parseCantidad(f.cantidad);
  if (!f.cantidad) errors.cantidad = "Falta la cantidad pagada";
  else if (cantidad === null || cantidad <= 0 || !/^\d+(\.\d{1,2})?$/.test(f.cantidad)) errors.cantidad = "Cantidad inválida";

  if (estatus === "Completo" && !MEMBRESIAS.some((m) => m.value === f.membresia)) errors.membresia = "Elige la membresía";
  return errors;
}

/** Campos obligatorios según el estado (en el orden en que aparecen en pantalla). */
export function camposRequeridos(f: SheetFields, estatus: Estatus): FieldKey[] {
  const base: FieldKey[] = ["folio", "telefono", "nombre", "correo"];
  if (!llevaPago(estatus)) return base;
  const r: FieldKey[] = [...base, "metodoPago"];
  if (requiereTarjeta(f.metodoPago)) r.push("tarjeta");
  r.push("cantidad");
  if (estatus === "Completo") r.push("membresia");
  return r;
}

export function whatsappLink(lada: string, telefono: string): string {
  const digits = `${lada}${telefono}`.replace(/\D/g, "");
  return digits.length > 10 ? `https://wa.me/${digits}` : "";
}

export function formatMXN(n: number): string {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
}

export interface ComparacionPago {
  plan: (typeof MEMBRESIAS)[number];
  pagado: number;
  diferencia: number; // pagado - precio
  concuerda: boolean;
}

/** Compara lo pagado con el precio del plan marcado. null si falta alguno de los dos (o no lleva pago). */
export function compararPago(f: SheetFields): ComparacionPago | null {
  const plan = MEMBRESIAS.find((m) => m.value === f.membresia);
  const pagado = parseCantidad(f.cantidad);
  if (!plan || pagado === null) return null;
  const diferencia = Math.round((pagado - plan.precio) * 100) / 100;
  const aMeses = Math.abs(pagado - plan.precioAMeses) < 1;
  return { plan, pagado, diferencia: aMeses ? 0 : diferencia, concuerda: aMeses || Math.abs(diferencia) < 1 };
}

/** Fila lista para el Sheet; las claves corresponden a los encabezados que detecta Codigo.gs. */
export interface SheetRecord {
  nombre: string;
  correo: string;
  lada: string;
  telefono: string;
  linkWa: string;
  tarjeta: string;
  metodoPago: string;
  cantidad: number | "";
  folio: string;
  membresia: string;
  notas: string;
  estatus: string;
}

export function toRecord(f: SheetFields, estatus: Estatus): SheetRecord {
  return {
    nombre: f.nombre,
    correo: f.correo,
    lada: LADAS.find((l) => l.value === f.lada)?.pais ?? "",
    telefono: `${f.lada} ${f.telefono}`,
    linkWa: whatsappLink(f.lada, f.telefono),
    tarjeta: celdaTarjeta(f),
    metodoPago: f.metodoPago,
    cantidad: parseCantidad(f.cantidad) ?? "",
    folio: f.folio,
    membresia: f.membresia,
    notas: f.notas ?? "",
    estatus,
  };
}

/** Inverso de toRecord: convierte una fila leída del Excel o de la Hoja de Google en campos de la app. */
export function fromRecord(r: Partial<Record<keyof SheetRecord, string | number>>): SheetFields {
  const txt = (v: unknown) => (v === undefined || v === null ? "" : String(v)).trim();
  const ladaTxt = txt(r.lada).toUpperCase();
  const telTxt = txt(r.telefono);
  let lada: Lada = ladaTxt === "USA" || telTxt.startsWith("+1") ? "+1" : "+52";
  let telefono = telTxt.replace(/\D/g, "");
  if (telTxt.startsWith("+")) {
    ({ lada, telefono } = splitTelefono(lada, telTxt));
    if (telefono.length > 10) telefono = telefono.slice(-10);
  }
  return {
    folio: normalizeFolio(txt(r.folio)),
    nombre: txt(r.nombre),
    correo: txt(r.correo).toLowerCase(),
    lada,
    telefono,
    tarjeta: txt(r.tarjeta).replace(/\D/g, "").slice(-4),
    marcaTarjeta: MARCAS_TARJETA.find((m) => txt(r.tarjeta).toLowerCase().includes(m.toLowerCase())) ?? "",
    metodoPago: txt(r.metodoPago),
    cantidad: normalizeCantidad(txt(r.cantidad)),
    membresia: MEMBRESIAS.find((m) => m.value.toLowerCase() === txt(r.membresia).toLowerCase())?.value ?? "",
    notas: txt(r.notas),
  };
}

/** Nombre del archivo de la foto: "<folio>_<Nombre_sin_acentos>.jpg" (o "…_pago2.jpg" en un pago adicional de la misma ficha). */
export function imageFileName(fields: SheetFields, pago?: number): string {
  const safeName = fields.nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w ]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return `${fields.folio}_${safeName || "sin_nombre"}${pago ? `_pago${pago}` : ""}.jpg`;
}
