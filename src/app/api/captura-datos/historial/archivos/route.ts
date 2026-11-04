import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { listarArchivosHistorial, urlFirmadaArchivoHistorial } from "@/lib/storage";
import { ErrorPeticion, respuestaError } from "@/lib/captura-datos/api";

const NOMBRE_VALIDO = /^historial_\d{4}-\d{2}-\d{2}_a_\d{4}-\d{2}-\d{2}\.csv$/;

// CSV de los periodos que el cron ya borró del historial. Sin `nombre` lista; con `nombre` devuelve un link de descarga. Solo admin.
export async function GET(req: NextRequest) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;
  if (permiso.usuario.rol !== "admin") return NextResponse.json({ error: "No tienes permiso para esto" }, { status: 403 });

  try {
    const nombre = req.nextUrl.searchParams.get("nombre");
    if (nombre === null) return NextResponse.json({ archivos: await listarArchivosHistorial() });
    if (!NOMBRE_VALIDO.test(nombre)) throw new ErrorPeticion(400, "Archivo inválido.");
    return NextResponse.json({ url: await urlFirmadaArchivoHistorial(nombre) });
  } catch (err) {
    return respuestaError(err, "captura-datos/historial/archivos GET");
  }
}
