import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { tienePermiso } from "@/lib/permisos";
import { obtenerSolicitud } from "@/lib/solicitudes";
import { urlFirmadaComprobante } from "@/lib/storage";

// Firma bajo demanda los comprobantes de UNA solicitud — ver comentario en
// GET /api/solicitudes: la lista ya no trae comprobantesUrl para
// aprobada/rechazada (para no firmar cientos en cada carga), así que el
// modal "Ver solicitud" los pide aquí solo cuando se abre.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("solicitarCliente");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const solicitud = await obtenerSolicitud(id);
  if (!solicitud) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

  const puedeRevisar = tienePermiso(permiso.usuario.rol, "revisarSolicitudes");
  if (!puedeRevisar && solicitud.solicitadoPorId !== permiso.usuario.id) {
    return NextResponse.json({ error: "No tienes permiso para esto" }, { status: 403 });
  }

  const resultados = await Promise.allSettled(solicitud.comprobantes.map((ruta) => urlFirmadaComprobante(ruta)));
  const comprobantesUrl = resultados
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value);

  return NextResponse.json({ comprobantesUrl });
}
