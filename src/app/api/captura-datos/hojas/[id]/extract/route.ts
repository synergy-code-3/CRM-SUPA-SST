import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { actualizarCamposHoja, ErrorHojaOcupada, ErrorVersion, esNoValida, marcarHojaNoValida, obtenerHoja } from "@/lib/captura-datos/db";
import { extractFromImage } from "@/lib/captura-datos/extract";
import { huellaImagen } from "@/lib/captura-datos/huella";
import { respuestaError, ErrorPeticion } from "@/lib/captura-datos/api";
import { leerFotoHoja } from "@/lib/storage";
import { descargarArchivo } from "@/lib/captura-datos/google";

export const maxDuration = 60;

async function fotoBase64(hoja: { origen: { rutaStorage?: string; driveId?: string } }): Promise<string> {
  if (hoja.origen.rutaStorage) {
    const buf = await leerFotoHoja(hoja.origen.rutaStorage);
    if (!buf) throw new ErrorPeticion(404, "No se encontró la foto de esta hoja.");
    return buf.toString("base64");
  }
  if (hoja.origen.driveId) {
    const { base64 } = await descargarArchivo(hoja.origen.driveId);
    return base64;
  }
  throw new ErrorPeticion(400, "Esta hoja no tiene foto asociada.");
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    const hoja = await obtenerHoja(id);
    if (!hoja) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

    const base64 = await fotoBase64(hoja);
    const huella = huellaImagen(base64);
    if (await esNoValida(huella)) {
      return NextResponse.json({ error: "Esta imagen ya se marcó antes como no válida (no es una hoja de registro)." }, { status: 422 });
    }

    const extraccion = await extractFromImage(base64);
    if (!extraccion.esHojaDeRegistro) {
      await marcarHojaNoValida(id, huella);
      return NextResponse.json({ error: extraccion.motivoNoHoja || "La imagen no parece una hoja de registro." }, { status: 422 });
    }

    const { esHojaDeRegistro: _esHoja, motivoNoHoja: _motivo, tieneVoucher: _tieneVoucher, voucherBox, ...campos } = extraccion;
    const actualizada = await actualizarCamposHoja(id, { campos, voucherBox }, undefined, permiso.usuario.id);
    return NextResponse.json({ hoja: actualizada });
  } catch (err) {
    if (err instanceof ErrorVersion || err instanceof ErrorHojaOcupada) return NextResponse.json({ error: err.message }, { status: 409 });
    return respuestaError(err, "captura-datos/hojas/[id]/extract POST");
  }
}
