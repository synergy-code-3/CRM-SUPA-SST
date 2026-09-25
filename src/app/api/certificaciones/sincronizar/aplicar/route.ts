import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import {
  aplicarCambiosPendientesCertificacion,
  aplicarNuevosPendientesCertificacion,
  type CambioAAplicarCertificacion,
  type NuevoClientePendienteCertificacion,
} from "@/lib/certificaciones-sync";
import { sincronizarTagsClubCertificaciones } from "@/lib/certificaciones";

export async function POST(req: NextRequest) {
  const permiso = await requerirPermiso("actualizarCertificaciones");
  if (!permiso.ok) return permiso.respuesta;

  const body = await req.json();
  const cambios: CambioAAplicarCertificacion[] = Array.isArray(body?.cambios) ? body.cambios : [];
  const nuevos: NuevoClientePendienteCertificacion[] = Array.isArray(body?.nuevos) ? body.nuevos : [];

  try {
    const [resultadoCambios, resultadoNuevos] = await Promise.all([
      aplicarCambiosPendientesCertificacion(cambios, permiso.usuario.nombre),
      aplicarNuevosPendientesCertificacion(nuevos, permiso.usuario.nombre, permiso.usuario.rol),
    ]);
    // Los clientes nuevos o cambiados también reciben su tag del Club.
    await sincronizarTagsClubCertificaciones().catch((err) => console.error("Tags del Club:", err));
    return NextResponse.json({
      cambiosAplicados: resultadoCambios.aplicados,
      erroresCambios: resultadoCambios.errores,
      nuevosCreados: resultadoNuevos.creados,
      erroresNuevos: resultadoNuevos.errores,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
