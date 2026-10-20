import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { obtenerHoja } from "@/lib/captura-datos/db";
import { urlFirmadaFotoHoja } from "@/lib/storage";
import { descargarArchivo } from "@/lib/captura-datos/google";
import { respuestaError } from "@/lib/captura-datos/api";

export const maxDuration = 60;

// Redirige a una URL firmada (Storage) o devuelve la foto descargada de
// Drive — a diferencia de los otros endpoints, aquí conviene no envolver la
// imagen en JSON: el navegador la usa directo como src de <img>.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    const hoja = await obtenerHoja(id);
    if (!hoja) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

    if (hoja.origen.rutaStorage) {
      const url = await urlFirmadaFotoHoja(hoja.origen.rutaStorage);
      return NextResponse.redirect(url);
    }
    if (hoja.origen.driveId) {
      const { base64, mime } = await descargarArchivo(hoja.origen.driveId);
      return new NextResponse(Buffer.from(base64, "base64"), { headers: { "Content-Type": mime } });
    }
    return NextResponse.json({ error: "Esta hoja no tiene foto asociada" }, { status: 404 });
  } catch (err) {
    return respuestaError(err, "captura-datos/hojas/[id]/foto GET");
  }
}
