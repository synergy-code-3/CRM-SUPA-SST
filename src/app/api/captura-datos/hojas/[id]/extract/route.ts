import { NextRequest, NextResponse } from "next/server";
import { requerirHoja } from "@/lib/captura-datos/acceso";
import { requerirPermiso } from "@/lib/auth";
import { actualizarCamposHoja, devolverLecturaIa, reclamarLecturaIa, ErrorEstadoHoja, ErrorHojaOcupada, ErrorVersion, esNoValida, marcarHojaNoValida } from "@/lib/captura-datos/db";
import { extractFromImage } from "@/lib/captura-datos/extract";
import { huellaImagen } from "@/lib/captura-datos/huella";
import { respuestaError, ErrorPeticion } from "@/lib/captura-datos/api";
import { leerFotoHoja } from "@/lib/storage";
import { descargarArchivo } from "@/lib/captura-datos/google";

export const maxDuration = 60;

async function fotoBase64(hoja: { origen: { rutaStorage?: string; driveId?: string } }): Promise<{ base64: string; mime: string }> {
  if (hoja.origen.rutaStorage) {
    const buf = await leerFotoHoja(hoja.origen.rutaStorage);
    if (!buf) throw new ErrorPeticion(404, "No se encontró la foto de esta hoja.");
    return { base64: buf.toString("base64"), mime: hoja.origen.rutaStorage.endsWith(".pdf") ? "application/pdf" : "image/jpeg" };
  }
  if (hoja.origen.driveId) {
    const { base64, mime } = await descargarArchivo(hoja.origen.driveId);
    return { base64, mime };
  }
  throw new ErrorPeticion(400, "Esta hoja no tiene foto asociada.");
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    const hoja = await requerirHoja(permiso.usuario, id);

    if (hoja.origen.leidaIa) throw new ErrorPeticion(409, "Esta hoja ya se leyó con IA.");
    const { base64, mime } = await fotoBase64(hoja);
    const huella = huellaImagen(base64);
    if (await esNoValida(huella)) {
      return NextResponse.json({ error: "Esta imagen ya se marcó antes como no válida (no es una hoja de registro)." }, { status: 422 });
    }

    if (!(await reclamarLecturaIa(id, hoja.origen))) throw new ErrorPeticion(409, "Esta hoja ya se leyó con IA.");
    let extraccion;
    try {
      extraccion = await extractFromImage(base64, mime);
    } catch (err) {
      await devolverLecturaIa(id, hoja.origen).catch((e) => console.error("extract: no se pudo devolver la lectura de la hoja", id, e)); // la IA no contestó: no se gastó la lectura
      throw err;
    }
    if (!extraccion.esHojaDeRegistro) {
      await marcarHojaNoValida(id, huella);
      return NextResponse.json({ error: extraccion.motivoNoHoja || "La imagen no parece una hoja de registro." }, { status: 422 });
    }

    const { esHojaDeRegistro: _esHoja, motivoNoHoja: _motivo, tieneVoucher: _tieneVoucher, voucherBox, ...campos } = extraccion;
    const actualizada = await actualizarCamposHoja(id, { campos, voucherBox }, undefined, permiso.usuario.id);
    return NextResponse.json({ hoja: actualizada });
  } catch (err) {
    if (err instanceof ErrorVersion || err instanceof ErrorHojaOcupada || err instanceof ErrorEstadoHoja) return NextResponse.json({ error: err.message }, { status: 409 });
    return respuestaError(err, "captura-datos/hojas/[id]/extract POST");
  }
}
