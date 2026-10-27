// Lectura con IA de una hoja de inscripción escaneada. A diferencia del
// proyecto original, aquí SOLO existe el modo "api" (Anthropic real) — se
// quita el modo "claude-code" (ejecutaba la CLI de Claude Code instalada en
// la máquina del operador; no tiene sentido en un servidor de Vercel, que
// no tiene la CLI ni una sesión de Claude Code iniciada). Sin
// ANTHROPIC_API_KEY, se tira un error claro en vez de intentar un modo que
// no puede funcionar aquí — mismo criterio que kajabi.ts/asistente-abeja-ia.ts.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { MARCAS_TARJETA, normalizeFields, type Extraction } from "./fields";
import { ErrorPeticion } from "./errores";

const MODEL = process.env.CAPTURA_DATOS_CLAUDE_MODEL || "claude-sonnet-5-5";

const ExtractionSchema = z.object({
  esHojaDeRegistro: z
    .boolean()
    .describe("true solo si la imagen es una hoja de inscripción en papel de CLUB SINERGETICO (aunque esté torcida, cortada en parte o mal iluminada)."),
  motivoNoHoja: z.string().describe("Si no es una hoja de registro, qué se ve en la imagen, en una frase en español. Vacío si sí lo es."),
  folio: z.string().describe("Número de folio impreso en rojo junto a 'Nº', solo dígitos. Vacío si no se ve."),
  nombre: z.string().describe("Nombre completo escrito a mano en la línea 'Nombre:'."),
  correo: z.string().describe("Correo escrito a mano en la línea 'Correo:'."),
  lada: z.enum(["+52", "+1"]).describe("+52 México (predeterminado) o +1 Estados Unidos."),
  telefono: z.string().describe("Número de la línea 'Celular:' SIN lada: 10 dígitos."),
  tieneVoucher: z.boolean().describe("true si hay un voucher/ticket de terminal bancaria en la foto."),
  voucherCaja: z
    .object({
      x: z.number().describe("Borde izquierdo, fracción 0–1 del ancho de la imagen"),
      y: z.number().describe("Borde superior, fracción 0–1 del alto de la imagen"),
      ancho: z.number().describe("Ancho, fracción 0–1 del ancho de la imagen"),
      alto: z.number().describe("Alto, fracción 0–1 del alto de la imagen"),
    })
    .nullable()
    .describe("Recuadro que encierra todo el voucher. null si no hay voucher."),
  metodoPago: z.enum(["", "Tarjeta", "Efectivo", "Transferencia", "Stripe", "Crypto"]).describe("La casilla 'Link Stripe' de la hoja se registra como 'Stripe'."),
  tarjeta: z.string().describe("Últimos 4 dígitos de la tarjeta. Vacío si no aparecen."),
  marcaTarjeta: z.enum(["", ...MARCAS_TARJETA]).describe("Marca de la tarjeta que dice el voucher (logo o texto VISA, MASTERCARD…). Vacío si no se ve."),
  cantidad: z.string().describe("Monto pagado en pesos, solo número con punto decimal (ej. '9997.00'). Vacío si no aparece."),
  membresia: z
    .enum(["", "3 Meses", "6 Meses", "12 Meses"])
    .describe("Plan señalado: $9,997 → '3 Meses', $12,997 → '6 Meses', $14,997 → '12 Meses'."),
});

const VOUCHER_ESQUINA_DERECHA = { x: 0.62, y: 0, w: 0.38, h: 0.4 };

const PROMPT = `Primero decide si la imagen es una hoja de inscripción en papel de "CLUB SINERGETICO": el formato
impreso con el recuadro FOLIO, el logo CLUB SINERGETICO y las líneas Nombre / Correo / Celular (normalmente
con el bloque MEMBRESÍA CLUB SINERGÉTICO y los precios). Cuenta aunque esté torcida, cortada en parte o mal
iluminada. NO es hoja de registro: un voucher o ticket suelto, una selfie, una pantalla, otro documento o
formulario, una hoja en blanco, una portada, etc. Si no lo es: esHojaDeRegistro = false, explica en
motivoNoHoja qué se ve y deja todos los demás campos vacíos (lada "+52", sin voucher).

Si sí es una hoja de inscripción, extrae los datos del cliente y del pago:

DATOS DEL CLIENTE (parte superior)
- folio: número impreso (normalmente en rojo) en el recuadro "FOLIO", después de "Nº". Ejemplo: "4476".
- nombre: lo escrito a mano en la línea "Nombre:". Respeta acentos; usa mayúsculas iniciales.
- correo: lo escrito a mano en la línea "Correo:". En minúsculas y sin espacios. La letra a mano confunde
  l/1/i, o/0, u/v, n/m, g/q, rn/m: elige la lectura más plausible para un correo real (por ejemplo gmail.com,
  hotmail.com, outlook.com, icloud.com, yahoo.com.mx).
- lada y telefono: de la línea "Celular:". telefono son los 10 dígitos sin lada. Si escribieron +1, "USA",
  o el número es claramente de Estados Unidos, lada "+1"; en cualquier otro caso "+52". Si escribieron la lada
  pegada (52, 521, +52, 1, +1) sepárala del número.

VOUCHER (ticket de terminal bancaria en papel térmico; suele estar engrapado o pegado arriba a la derecha
de la hoja y puede tapar parte de ella)
- Si hay voucher: tieneVoucher = true; voucherCaja = recuadro que lo encierra completo; metodoPago = "Tarjeta";
  cantidad = el TOTAL cobrado del voucher; tarjeta = últimos 4 dígitos del número de tarjeta enmascarado
  (p. ej. **** **** **** 1234 → "1234"); marcaTarjeta = la marca que dice el voucher (Visa, Mastercard,
  American Express o Carnet), vacío si no aparece; nunca la deduzcas por el número.
- Si no hay voucher: tieneVoucher = false; voucherCaja = null; metodoPago = la casilla marcada en
  "Método de Pago" (Crypto, Tarjeta, Efectivo, Link Stripe → "Stripe", o Transferencia), vacío si ninguna;
  tarjeta = lo escrito en "Últimos 4 dígitos"; cantidad = monto escrito a mano si lo hay (p. ej. junto a
  "Pago 100%"), vacío si no.

MEMBRESÍA (parte inferior de la hoja: tres opciones $9,997, $12,997 y $14,997)
- membresia: la opción señalada a mano de cualquier forma (palomita, tache, casilla rellena, círculo,
  subrayado, flecha). El texto impreso "SOLO POR HOY" NO cuenta como señal. $9,997 → "3 Meses",
  $12,997 → "6 Meses", $14,997 → "12 Meses". Vacío si ninguna está señalada; si hay más de una o es
  ambigua, elige la más probable.

IMPORTANTE: la hoja trae impresos datos de la empresa que NO son del cliente y debes ignorar: los teléfonos
de "¿Dudas? Manda Whatsapp" (+52 1 33 2811 6675, +52 332 101 3336), la CLABE bancaria y la URL.
Si un campo está en blanco, devuélvelo vacío; nunca inventes datos.`;

/** `mime`: image/jpeg|png|webp|gif o application/pdf (el PDF se manda completo, sin partirlo). */
export async function extractFromImage(base64: string, mime = "image/jpeg"): Promise<Extraction> {
  if (!/^sk-ant-\w/.test(process.env.ANTHROPIC_API_KEY ?? "")) {
    throw new ErrorPeticion(503, "Falta configurar ANTHROPIC_API_KEY");
  }
  const out = await extractWithApi(base64, mime);
  if (!out.esHojaDeRegistro) {
    return {
      ...normalizeFields({ ...out, folio: "", nombre: "", correo: "", telefono: "", tarjeta: "", marcaTarjeta: "", metodoPago: "", cantidad: "", membresia: "", notas: "" }),
      esHojaDeRegistro: false,
      motivoNoHoja: out.motivoNoHoja || "La imagen no parece una hoja de registro.",
      tieneVoucher: false,
      voucherBox: null,
    };
  }
  const c = out.voucherCaja;
  // La esquina superior derecha es el voucher salvo que la IA diga que no hay voucher o ubique otro recuadro.
  const voucherBox = !out.tieneVoucher
    ? null
    : c && c.ancho > 0 && c.alto > 0
      ? { x: clamp01(c.x), y: clamp01(c.y), w: clamp01(c.ancho), h: clamp01(c.alto) }
      : VOUCHER_ESQUINA_DERECHA;
  return {
    // El campo NOTAS del Sheet lo llena la persona, no la IA
    ...normalizeFields({ ...out, notas: "" }),
    esHojaDeRegistro: true,
    motivoNoHoja: "",
    tieneVoucher: out.tieneVoucher,
    voucherBox,
  };
}

function imagenMime(mime: string) {
  return (["image/png", "image/webp", "image/gif"].includes(mime) ? mime : "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif";
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

async function extractWithApi(base64: string, mime: string): Promise<z.infer<typeof ExtractionSchema>> {
  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: zodOutputFormat(ExtractionSchema) },
    messages: [
      {
        role: "user",
        content: [
          mime === "application/pdf"
            ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } }
            : { type: "image" as const, source: { type: "base64" as const, media_type: imagenMime(mime), data: base64 } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new ErrorPeticion(502, "La IA rechazó procesar esta imagen.");
  }
  const out = response.parsed_output;
  if (!out) throw new ErrorPeticion(502, "La IA no devolvió datos válidos.");
  return out;
}
