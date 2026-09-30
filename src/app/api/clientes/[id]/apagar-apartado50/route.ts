import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { apagarApartado50 } from "@/lib/db";

// "Apagar el temporizador" de Apartado 50% — el cliente ya liquidó el otro
// 50%, se queda con su acceso normal y deja de aparecer en la ventana de
// "vencidos" / la fila roja.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("editarCliente");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const clienteId = decodeURIComponent(id);

  try {
    const cliente = await apagarApartado50(clienteId, permiso.usuario.nombre);
    return NextResponse.json({ cliente });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
