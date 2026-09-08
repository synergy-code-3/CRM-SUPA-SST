import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { otorgarAccesoKajabiYSkool } from "@/lib/alta-cliente";
import { renovarMembresia } from "@/lib/db";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("renovarMembresia");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const clienteId = decodeURIComponent(id);

  try {
    // Campos propios del CRM (etiqueta, tipo de membresía, acceso a
    // plataforma, fin de acceso) — no depende de que Kajabi/Skool respondan.
    const cliente = await renovarMembresia(clienteId, permiso.usuario.nombre);
    const resultado = await otorgarAccesoKajabiYSkool(cliente);
    return NextResponse.json(resultado);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
