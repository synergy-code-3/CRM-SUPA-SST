import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import {
  actualizarAccesos,
  actualizarDatosCliente,
  actualizarTags,
  establecerMensajeBienvenidaWa,
  obtenerCliente,
} from "@/lib/db";
import { ESTADOS_MENSAJE_BIENVENIDA_WA } from "@/lib/types";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verClientes");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const cliente = await obtenerCliente(decodeURIComponent(id));
  if (!cliente) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ cliente });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json();
  // "accesos" (boletos General/VIP/Black) y "datos"/"tags" (datos del
  // cliente) requieren el mismo nivel de permiso hoy (editarCliente/
  // editarAccesos = solo admin), pero se validan por separado a propósito
  // para poder abrir uno sin el otro más adelante si hace falta.
  const permiso = await requerirPermiso(body?.tipo === "accesos" ? "editarAccesos" : "editarCliente");
  if (!permiso.ok) return permiso.respuesta;
  const autor = permiso.usuario.nombre;

  const { id } = await params;
  const clienteId = decodeURIComponent(id);

  try {
    if (body.tipo === "accesos") {
      const cliente = await actualizarAccesos(clienteId, body.accesos, autor);
      return NextResponse.json({ cliente });
    }

    if (body.tipo === "datos") {
      const cliente = await actualizarDatosCliente(
        clienteId,
        {
          nombre: body.nombre,
          email: body.email,
          telefono: body.telefono,
          pais: body.pais,
          ciudad: body.ciudad,
          notas: body.notas,
          evento: body.evento,
          etiqueta: body.etiqueta,
          accesoPlataforma: body.accesoPlataforma,
          tipoMembresia: body.tipoMembresia,
          vencimientoSkool: body.vencimientoSkool,
          invitacionSkool: body.invitacionSkool,
          llamada: body.llamada,
          notasSoporte: body.notasSoporte,
          fechaRenovacion: body.fechaRenovacion,
          finAccesoDeseado: body.finAcceso,
        },
        autor
      );
      return NextResponse.json({ cliente });
    }

    if (body.tipo === "tags") {
      const cliente = await actualizarTags(clienteId, body.tags ?? [], autor);
      return NextResponse.json({ cliente });
    }

    if (body.tipo === "mensaje-bienvenida-wa") {
      if (!(ESTADOS_MENSAJE_BIENVENIDA_WA as readonly string[]).includes(body.estado)) {
        return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
      }
      const cliente = await establecerMensajeBienvenidaWa(clienteId, body.estado, autor);
      return NextResponse.json({ cliente });
    }

    return NextResponse.json({ error: "Tipo de actualización no soportado" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
