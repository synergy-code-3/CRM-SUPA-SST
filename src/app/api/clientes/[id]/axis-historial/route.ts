import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { obtenerCliente } from "@/lib/db";
import { obtenerHistorialAxis } from "@/lib/axis";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verClientes");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const cliente = await obtenerCliente(decodeURIComponent(id));
  if (!cliente) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  try {
    const historial = await obtenerHistorialAxis(cliente.email);
    return NextResponse.json({ historial });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
