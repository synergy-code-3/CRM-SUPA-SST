import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { previsualizarSincronizacionCertificacion } from "@/lib/certificaciones-sync";

// Preview: no escribe nada. El admin/coordinador confirma qué aplicar
// desde /api/certificaciones/sincronizar/aplicar.
export async function POST() {
  const permiso = await requerirPermiso("actualizarCertificaciones");
  if (!permiso.ok) return permiso.respuesta;

  try {
    const resultado = await previsualizarSincronizacionCertificacion();
    return NextResponse.json(resultado);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
