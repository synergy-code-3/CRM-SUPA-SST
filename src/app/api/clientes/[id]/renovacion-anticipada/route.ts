import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { finAccesoCalculado } from "@/lib/fechas";
import { marcarInvitacionSkoolEnviada, registrarRenovacionAnticipadaSinTocarKajabi } from "@/lib/db";
import { invitarASkool } from "@/lib/skool";

// Botón "Registrar renovación anticipada" (ClientePanel, solo visible con la
// oferta todavía activa en Kajabi): el cliente ya pagó una renovación real
// antes de que le venciera. A diferencia de /renovar, esto NUNCA toca Kajabi
// (nada que revocar/re-otorgar — ya lo tiene activo) — solo actualiza el CRM
// (fin de acceso + accesos sumados, ver registrarRenovacionAnticipadaSinTocarKajabi)
// y sí reenvía la invitación de Skool, con su vencimiento igualado al nuevo
// fin de acceso del Club (mismo criterio que /renovar).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("renovarMembresia");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const clienteId = decodeURIComponent(id);

  try {
    let cliente = await registrarRenovacionAnticipadaSinTocarKajabi(clienteId, permiso.usuario.nombre);

    let avisoSkool: string | null = null;
    try {
      await invitarASkool(cliente.email);
      const fin = finAccesoCalculado(null, cliente.fechaRenovacion);
      cliente = await marcarInvitacionSkoolEnviada(cliente.id, undefined, fin);
    } catch (err) {
      avisoSkool = err instanceof Error ? err.message : "No se pudo enviar la invitación a Skool";
    }

    return NextResponse.json({ cliente, avisoSkool });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
