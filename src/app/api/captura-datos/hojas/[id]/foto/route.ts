import { NextRequest, NextResponse } from "next/server";
import { requerirHoja } from "@/lib/captura-datos/acceso";
import { requerirPermiso } from "@/lib/auth";
import { leerFotoHoja, urlFirmadaFotoHoja } from "@/lib/storage";
import { descargarArchivo } from "@/lib/captura-datos/google";
import { respuestaError } from "@/lib/captura-datos/api";

export const maxDuration = 60;

// El tipo de Drive viene de fuera: solo se sirven imágenes y PDF (nunca html/svg, que correrían en el origen del CRM).
const TIPOS_PERMITIDOS = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const CABECERAS_SEGURAS = { "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'" };

// Redirige a una URL firmada (Storage) o devuelve la foto descargada de
// Drive — a diferencia de los otros endpoints, aquí conviene no envolver la
// imagen en JSON: el navegador la usa directo como src de <img>.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    const hoja = await requerirHoja(permiso.usuario, id);

    if (hoja.origen.rutaStorage?.endsWith(".pdf")) {
      // El PDF se sirve desde aquí (mismo origen) para poder mostrarlo en un <iframe>.
      const buf = await leerFotoHoja(hoja.origen.rutaStorage);
      if (!buf) return NextResponse.json({ error: "No se encontró el archivo" }, { status: 404 });
      return new NextResponse(new Uint8Array(buf), { headers: { ...CABECERAS_SEGURAS, "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="hoja.pdf"' } });
    }
    if (hoja.origen.rutaStorage) {
      const url = await urlFirmadaFotoHoja(hoja.origen.rutaStorage);
      return NextResponse.redirect(url);
    }
    if (hoja.origen.driveId) {
      const { base64, mime } = await descargarArchivo(hoja.origen.driveId);
      if (!TIPOS_PERMITIDOS.has(mime)) return NextResponse.json({ error: "Tipo de archivo no permitido" }, { status: 415 });
      return new NextResponse(Buffer.from(base64, "base64"), { headers: { ...CABECERAS_SEGURAS, "Content-Type": mime } });
    }
    return NextResponse.json({ error: "Esta hoja no tiene foto asociada" }, { status: 404 });
  } catch (err) {
    return respuestaError(err, "captura-datos/hojas/[id]/foto GET");
  }
}
