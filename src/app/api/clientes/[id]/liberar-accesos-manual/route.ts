import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { liberarAccesosEditadoManual } from "@/lib/db";

// Quita la traba de "editado a mano" en los accesos de un cliente y
// recalcula de inmediato con el motor de reglas — el botón "Volver a
// calcular automático" del panel.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("editarAccesos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const clienteId = decodeURIComponent(id);

  try {
    const cliente = await liberarAccesosEditadoManual(clienteId, permiso.usuario.nombre);
    return NextResponse.json({ cliente });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo liberar los accesos";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
