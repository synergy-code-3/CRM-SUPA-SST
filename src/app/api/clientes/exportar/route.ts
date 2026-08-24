import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { exportarClientes, type EstadoFiltro, type RegionFiltro, type TipoEventoFiltro, type VigenciaFiltro } from "@/lib/db";

// Trae todos los clientes que matcheen los filtros (no solo la página
// visible) para el botón "Descargar CSV". Acepta los mismos query params que
// GET /api/clientes; si no se manda ninguno, exporta la lista completa.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const permiso = await requerirPermiso("exportarCsv");
  if (!permiso.ok) return permiso.respuesta;

  const { searchParams } = new URL(req.url);
  const busqueda = searchParams.get("q") ?? undefined;
  const estado = (searchParams.get("estado") as EstadoFiltro | null) ?? undefined;
  const region = (searchParams.get("region") as RegionFiltro | null) ?? undefined;
  const eventos = searchParams.get("eventos")?.split(",").filter(Boolean) ?? undefined;
  const tipoEvento = (searchParams.get("tipoEvento") as TipoEventoFiltro | null) ?? undefined;
  const membresias = searchParams.get("membresias")?.split(",").filter(Boolean) ?? undefined;
  const desde = searchParams.get("desde") ?? undefined;
  const hasta = searchParams.get("hasta") ?? undefined;
  const vencidosAntesDe = searchParams.get("vencidosAntesDe") ?? undefined;
  const vigencia = (searchParams.get("vigencia") as VigenciaFiltro | null) ?? undefined;

  try {
    const clientes = await exportarClientes({
      busqueda,
      estado,
      region,
      eventos,
      tipoEvento,
      membresias,
      desde,
      hasta,
      vencidosAntesDe,
      vigencia,
    });
    return NextResponse.json({ clientes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
