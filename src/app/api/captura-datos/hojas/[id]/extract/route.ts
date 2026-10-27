import { after, NextRequest, NextResponse } from "next/server";
import { requerirHoja } from "@/lib/captura-datos/acceso";
import { requerirPermiso } from "@/lib/auth";
import { actualizarCamposHoja, devolverLecturaIa, finalizarLecturaIa, reclamarLecturaIa, ErrorEstadoHoja, ErrorHojaOcupada, ErrorVersion, esNoValida, marcarHojaNoValida } from "@/lib/captura-datos/db";
import { extractFromImage } from "@/lib/captura-datos/extract";
import { adelantarLecturas, datosDeExtraccion, fotoBase64 } from "@/lib/captura-datos/lectura-ia";
import { huellaImagen } from "@/lib/captura-datos/huella";
import { respuestaError, ErrorPeticion } from "@/lib/captura-datos/api";

export const maxDuration = 120;

/** Al leer una hoja, el servidor deja ya leídas las siguientes hojas libres (ver lectura-ia.ts). */
const HOJAS_POR_ADELANTADO_AL_LEER = 2;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    const hoja = await requerirHoja(permiso.usuario, id);

    if (hoja.origen.leidaIa) throw new ErrorPeticion(409, "Esta hoja ya se leyó con IA.");
    const { base64, mime } = await fotoBase64(hoja.origen);
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

    const { campos, voucherBox } = datosDeExtraccion(extraccion);
    const actualizada = await actualizarCamposHoja(id, { campos, voucherBox }, undefined, permiso.usuario.id);
    // Ya se guardó: la lectura queda gastada (si esto falla, la marca de "en curso" vence sola, ver LEASE_LECTURA_IA_MS).
    await finalizarLecturaIa(id, hoja.origen).catch((e) => console.error("extract: no se pudo cerrar la lectura de la hoja", id, e));
    // Con la respuesta ya enviada, el servidor sigue leyendo las siguientes hojas libres para que lleguen listas.
    after(() => adelantarLecturas(hoja.eventoId, HOJAS_POR_ADELANTADO_AL_LEER));
    return NextResponse.json({ hoja: actualizada });
  } catch (err) {
    if (err instanceof ErrorVersion || err instanceof ErrorHojaOcupada || err instanceof ErrorEstadoHoja) return NextResponse.json({ error: err.message }, { status: 409 });
    return respuestaError(err, "captura-datos/hojas/[id]/extract POST");
  }
}
