// Entrega la imagen o el PDF de una hoja (Storage o Drive) para verla o descargarla. El tipo de Drive viene de fuera:
// solo se sirven imágenes y PDF (nunca html/svg, que correrían en el origen del CRM).
import { NextResponse } from "next/server";
import { leerFotoHoja, urlFirmadaFotoHoja } from "@/lib/storage";
import { descargarArchivo } from "./google";
import type { HojaCaptura } from "./modelo";

const EXTENSION_DE_TIPO: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const TIPO_DE_EXTENSION: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };
const CABECERAS_SEGURAS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'" };

function cabeceras(hoja: Pick<HojaCaptura, "id" | "folio">, tipo: string, descargar: boolean): Record<string, string> {
  const sufijo = (hoja.folio ?? "").replace(/\D/g, "");
  const nombre = `hoja${sufijo ? `-${sufijo}` : ""}.${EXTENSION_DE_TIPO[tipo]}`;
  return { ...CABECERAS_SEGURAS, "Content-Type": tipo, "Content-Disposition": `${descargar ? "attachment" : "inline"}; filename="${nombre}"` };
}

// Un PDF con varias hojas trae también las de otras personas: no se entrega completo a quien solo ve a un cliente.
const pdfCompartido = (hoja: Pick<HojaCaptura, "origen">, tipo: string) => tipo === "application/pdf" && (hoja.origen.paginas ?? 1) > 1;
const PDF_COMPARTIDO = () => NextResponse.json({ error: "Esta hoja es una página de un PDF con varias hojas; se consulta desde Captura de Datos." }, { status: 403 });

const noEncontrado = (mensaje: string) => NextResponse.json({ error: mensaje }, { status: 404 });

export async function respuestaArchivoHoja(hoja: Pick<HojaCaptura, "id" | "folio" | "origen">, descargar: boolean): Promise<NextResponse> {
  const { rutaStorage, driveId } = hoja.origen;
  if (rutaStorage) {
    const extension = rutaStorage.split(".").pop()?.toLowerCase() ?? "";
    const tipo = TIPO_DE_EXTENSION[extension];
    if (!tipo) return NextResponse.json({ error: "Tipo de archivo no permitido" }, { status: 415 });
    if (pdfCompartido(hoja, tipo)) return PDF_COMPARTIDO();
    if (!descargar && tipo !== "application/pdf") return NextResponse.redirect(await urlFirmadaFotoHoja(rutaStorage));
    const bytes = await leerFotoHoja(rutaStorage);
    if (!bytes) return noEncontrado("No se encontró el archivo");
    return new NextResponse(new Uint8Array(bytes), { headers: cabeceras(hoja, tipo, descargar) });
  }
  if (driveId) {
    const { base64, mime } = await descargarArchivo(driveId);
    if (!EXTENSION_DE_TIPO[mime]) return NextResponse.json({ error: "Tipo de archivo no permitido" }, { status: 415 });
    if (pdfCompartido(hoja, mime)) return PDF_COMPARTIDO();
    return new NextResponse(Buffer.from(base64, "base64"), { headers: cabeceras(hoja, mime, descargar) });
  }
  return noEncontrado("Esta hoja no tiene foto asociada");
}
