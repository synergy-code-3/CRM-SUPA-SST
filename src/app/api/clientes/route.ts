import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import {
  listarClientes,
  type EstadoFiltro,
  type ProcesoFiltro,
  type RegionFiltro,
  type TipoEventoFiltro,
  type VigenciaFiltro,
} from "@/lib/db";
import { altaCompletaCliente } from "@/lib/alta-cliente";

export async function GET(req: NextRequest) {
  const permiso = await requerirPermiso("verClientes");
  if (!permiso.ok) return permiso.respuesta;

  const { searchParams } = new URL(req.url);
  const busqueda = searchParams.get("q") ?? undefined;
  const limite = Number(searchParams.get("limite") ?? 100);
  const pagina = Number(searchParams.get("pagina") ?? 1);
  const estado = (searchParams.get("estado") as EstadoFiltro | null) ?? undefined;
  const region = (searchParams.get("region") as RegionFiltro | null) ?? undefined;
  const eventos = searchParams.get("eventos")?.split(",").filter(Boolean) ?? undefined;
  const tipoEvento = (searchParams.get("tipoEvento") as TipoEventoFiltro | null) ?? undefined;
  const membresias = searchParams.get("membresias")?.split(",").filter(Boolean) ?? undefined;
  const desde = searchParams.get("desde") ?? undefined;
  const hasta = searchParams.get("hasta") ?? undefined;
  const vencidosAntesDe = searchParams.get("vencidosAntesDe") ?? undefined;
  const vigencia = (searchParams.get("vigencia") as VigenciaFiltro | null) ?? undefined;
  const proceso = (searchParams.get("proceso") as ProcesoFiltro | null) ?? undefined;
  const { clientes, total } = await listarClientes({
    busqueda,
    limite,
    pagina,
    estado,
    region,
    eventos,
    tipoEvento,
    membresias,
    desde,
    hasta,
    vencidosAntesDe,
    vigencia,
    proceso,
  });
  return NextResponse.json({ clientes, total });
}

export async function POST(req: NextRequest) {
  const permiso = await requerirPermiso("crearCliente");
  if (!permiso.ok) return permiso.respuesta;

  const body = await req.json();
  if (!body?.email?.trim() || !body?.nombre?.trim()) {
    return NextResponse.json({ error: "Nombre y correo son obligatorios" }, { status: 400 });
  }
  try {
    const { cliente, avisoKajabi, avisoSkool, avisoGhl, avisoOfertaAdicional } = await altaCompletaCliente(
      {
        nombre: body.nombre,
        email: body.email,
        telefono: body.telefono,
        pais: body.pais,
        evento: body.evento,
        tipoMembresia: body.tipoMembresia,
        etiqueta: body.etiqueta,
        ofertaAdicionalId: body.ofertaAdicionalId,
        ofertaAdicionalTitulo: body.ofertaAdicionalTitulo,
      },
      permiso.usuario.nombre
    );

    return NextResponse.json({ cliente, avisoKajabi, avisoSkool, avisoGhl, avisoOfertaAdicional });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
