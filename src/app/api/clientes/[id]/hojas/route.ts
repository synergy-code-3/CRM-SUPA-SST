import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { obtenerCliente } from "@/lib/db";
import { listarHojasDeCliente } from "@/lib/captura-datos/db";
import { respuestaError } from "@/lib/captura-datos/api";
import { decodificar } from "@/lib/captura-datos/cliente-hojas";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verClientes");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    const cliente = await obtenerCliente(decodificar(id));
    if (!cliente) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ hojas: await listarHojasDeCliente(cliente) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return respuestaError(err, "clientes/[id]/hojas GET");
  }
}
