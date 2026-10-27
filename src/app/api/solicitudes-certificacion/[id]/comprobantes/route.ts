import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { tienePermiso } from "@/lib/permisos";
import { obtenerSolicitudCertificacion } from "@/lib/solicitudes-certificacion";
import { urlFirmadaComprobante } from "@/lib/storage";

// Firma bajo demanda los comprobantes de UNA solicitud — mismo motivo que
// GET /api/solicitudes/[id]/comprobantes: el GET de la lista ya no trae
// comprobantesUrl para aprobada/rechazada (firmarlas todas en cada carga se
// volvía cientos de llamadas a Storage de más), el modal "Ver solicitud"
// los pide aquí solo cuando se abre.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("solicitarCertificacion");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const solicitud = await obtenerSolicitudCertificacion(id);
  if (!solicitud) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

  const puedeRevisar = tienePermiso(permiso.usuario.rol, "revisarSolicitudesCertificacion");
  if (!puedeRevisar && solicitud.solicitadoPorId !== permiso.usuario.id) {
    return NextResponse.json({ error: "No tienes permiso para esto" }, { status: 403 });
  }

  const resultados = await Promise.allSettled(solicitud.comprobantes.map((ruta) => urlFirmadaComprobante(ruta)));
  const comprobantesUrl = resultados
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value);

  return NextResponse.json({ comprobantesUrl });
}
