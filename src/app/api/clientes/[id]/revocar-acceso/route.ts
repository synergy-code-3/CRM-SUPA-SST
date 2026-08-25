import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { obtenerCliente, revocarAccesoCliente } from "@/lib/db";
import { KAJABI_OFFER_ID_CLUB_SINERGETICO, revocarOferta } from "@/lib/kajabi";

// "Revocar acceso" (reembolsos u otros casos que deben quitar el acceso ya)
// — a diferencia de "Pausar", esto es permanente: no guarda días
// pendientes para reanudar. revocarOferta ya es un no-op seguro si el
// cliente no tenía la oferta activa (ej. si ya estaba pausado).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("revocarAccesoCliente");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const clienteId = decodeURIComponent(id);

  try {
    const clienteAntes = await obtenerCliente(clienteId);
    if (!clienteAntes) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    let avisoKajabi: string | null = null;
    try {
      await revocarOferta(clienteAntes.email, KAJABI_OFFER_ID_CLUB_SINERGETICO);
    } catch (err) {
      avisoKajabi = err instanceof Error ? err.message : "No se pudo revocar el acceso en Kajabi";
    }

    const cliente = await revocarAccesoCliente(clienteId, permiso.usuario.nombre);
    return NextResponse.json({ cliente, avisoKajabi });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
