import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { esAprobadorBorrado } from "@/lib/captura-datos/borrado";
import { listarSolicitudesBorradoPendientes } from "@/lib/captura-datos/db";
import { respuestaError } from "@/lib/captura-datos/api";

// Solicitudes pendientes de borrado. Solo admin las ve; `puedeResolver` indica si esta persona es la aprobadora.
export async function GET() {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;
  if (permiso.usuario.rol !== "admin") return NextResponse.json({ solicitudes: [], puedeResolver: false });

  try {
    const solicitudes = await listarSolicitudesBorradoPendientes();
    return NextResponse.json({ solicitudes, puedeResolver: esAprobadorBorrado(permiso.usuario) });
  } catch (err) {
    return respuestaError(err, "captura-datos/solicitudes-borrado GET");
  }
}
