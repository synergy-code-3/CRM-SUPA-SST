import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requerirPermiso } from "@/lib/auth";
import { idDeEnlace, infoCarpeta, listarArchivos } from "@/lib/captura-datos/google";
import { leerJson, respuestaError, ErrorPeticion } from "@/lib/captura-datos/api";

export const maxDuration = 60;

const body = z.object({
  enlace: z.string().max(500),
  subcarpetaId: z.string().max(200).optional(), // si se manda, también lista los archivos de esa subcarpeta
});

export async function POST(req: NextRequest) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  try {
    const b = await leerJson(req, body);
    const carpetaId = idDeEnlace(b.enlace);
    if (!carpetaId) throw new ErrorPeticion(400, "Ese enlace de Drive no parece válido.");

    const info = await infoCarpeta(carpetaId);
    if (!b.subcarpetaId) return NextResponse.json({ info });

    const archivos = await listarArchivos(b.subcarpetaId);
    return NextResponse.json({ info, archivos: archivos.archivos });
  } catch (err) {
    return respuestaError(err, "captura-datos/drive/carpeta POST");
  }
}
