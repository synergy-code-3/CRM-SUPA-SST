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
import { altaCompletaCliente, verificarPreAlta } from "@/lib/alta-cliente";

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

  // "colision" distingue, para "Nuevo cliente", entre los tres motivos por
  // los que un correo puede no dejarse dar de alta a ciegas — el mensaje de
  // "error" se mantiene igual que antes ("Ya existe un cliente con ese
  // correo") para los dos primeros casos, así el importador de CSV
  // (ImportarClientesModal.tsx) los sigue reconociendo como "ya existe" sin
  // cambios; "kajabi_previo" es nuevo y cae en la categoría de error normal
  // para importaciones masivas (no se puede confirmar "Sobrescribir" fila
  // por fila en un CSV).
  if (!body.sobrescribir) {
    const pre = await verificarPreAlta(body.email);
    if (pre.tipo === "ya_activo" || pre.tipo === "ya_inactivo") {
      return NextResponse.json(
        { error: "Ya existe un cliente con ese correo", colision: pre.tipo, clienteId: pre.clienteId },
        { status: 409 }
      );
    }
    if (pre.tipo === "kajabi_previo") {
      return NextResponse.json(
        {
          error: "Este contacto ya tenía la oferta de Kajabi otorgada de antes de este CRM",
          colision: "kajabi_previo",
        },
        { status: 409 }
      );
    }
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
