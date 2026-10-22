// Prueba de la lectura con IA de hojas de inscripción, pensada para gastar lo mínimo.
//
//   npx tsx scripts/evaluar-lectura-ia.ts <carpeta-con-hojas> [--modelo=claude-sonnet-5-5] [--max=2] [--ejecutar]
//
// Sin --ejecutar solo cuenta los tokens de entrada (count_tokens es gratis) y muestra el peor caso de gasto: no se
// genera ninguna respuesta. Con --ejecutar procesa como máximo --max archivos (tope duro 5, por defecto 2).
// Los precios se pasan con --precio-in y --precio-out (USD por millón de tokens) para ver el estimado en dólares;
// no se fijan aquí porque cambian y un valor viejo daría una cifra falsa.
import "./_env"; // primero: carga .env.local antes de leer variables
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const TOPE_DURO = 5;
const SALIDA_ESTIMADA_TOKENS = 700; // un JSON con ~12 campos; el peor caso real es mayor, por eso es solo un estimado
const TIPOS: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".pdf": "application/pdf" };

const args = process.argv.slice(2);
const carpeta = args.find((a) => !a.startsWith("--"));
const opcion = (nombre: string) => args.find((a) => a.startsWith(`--${nombre}=`))?.split("=")[1];
const ejecutar = args.includes("--ejecutar");
const modelo = opcion("modelo") ?? "claude-sonnet-5-5";
const max = Math.min(Number(opcion("max") ?? 2), TOPE_DURO);
const precioIn = Number(opcion("precio-in"));
const precioOut = Number(opcion("precio-out"));

async function main() {
  if (!carpeta) throw new Error("Indica la carpeta con las hojas de prueba.");
  if (!/^sk-ant-\w/.test(process.env.ANTHROPIC_API_KEY ?? "")) throw new Error("Falta ANTHROPIC_API_KEY en el entorno.");
  process.env.CAPTURA_DATOS_CLAUDE_MODEL = modelo; // lo lee extract.ts al importarse
  const archivos = readdirSync(carpeta).filter((f) => TIPOS[extname(f).toLowerCase()]).sort().slice(0, max);
  if (archivos.length === 0) throw new Error("No hay imágenes ni PDF en esa carpeta.");

  const cliente = new Anthropic();
  const { extractFromImage } = await import("../src/lib/captura-datos/extract");
  let entradaTotal = 0;

  for (const nombre of archivos) {
    const mime = TIPOS[extname(nombre).toLowerCase()];
    const base64 = readFileSync(join(carpeta, nombre)).toString("base64");
    const bloque = mime === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: mime, data: base64 } } as const)
      : ({ type: "image", source: { type: "base64", media_type: mime as "image/jpeg" | "image/png", data: base64 } } as const);
    const { input_tokens } = await cliente.messages.countTokens({ model: modelo, messages: [{ role: "user", content: [bloque, { type: "text", text: "Lee esta hoja." }] }] });
    entradaTotal += input_tokens;
    console.log(`${nombre}: ${input_tokens} tokens de entrada`);

    if (!ejecutar) continue;
    const r = await extractFromImage(base64, mime);
    console.log(JSON.stringify(r, null, 2));
  }

  const salida = SALIDA_ESTIMADA_TOKENS * archivos.length;
  console.log(`\n${modelo}: ${archivos.length} archivo(s), ~${entradaTotal} tokens de entrada + ~${salida} de salida (estimado).`);
  if (precioIn > 0 && precioOut > 0) {
    const usd = (entradaTotal * precioIn + salida * precioOut) / 1_000_000;
    console.log(`Costo estimado${ejecutar ? "" : " si lo ejecutaras"}: ~US$${usd.toFixed(4)}`);
  }
  if (!ejecutar) console.log("Modo simulación: no se generó ninguna respuesta. Agrega --ejecutar para procesarlas de verdad.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
