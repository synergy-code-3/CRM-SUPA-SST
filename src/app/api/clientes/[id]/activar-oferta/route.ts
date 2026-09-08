import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { otorgarAccesoKajabiYSkool } from "@/lib/alta-cliente";
import { activarOfertaComoCompra } from "@/lib/db";

// Mismo permiso que "Renovar" — es la misma clase de acción (otorga acceso
// real en Kajabi otra vez), solo que sin la etiqueta ni la regla fija de
// boletos por país de una renovación real.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("renovarMembresia");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const clienteId = decodeURIComponent(id);

  try {
    // Campo propio del CRM (acceso a plataforma, fecha de renovación) — no
    // depende de que Kajabi/Skool respondan.
    const cliente = await activarOfertaComoCompra(clienteId, permiso.usuario.nombre);
    const resultado = await otorgarAccesoKajabiYSkool(cliente);
    return NextResponse.json(resultado);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
