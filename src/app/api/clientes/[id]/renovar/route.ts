import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import {
  marcarInvitacionSkoolEnviada,
  recalcularAccesos,
  registrarTagKajabi,
  renovarMembresia,
  vincularKajabiContactId,
} from "@/lib/db";
import { altaEnKajabi, KAJABI_TAG_MIEMBRO_DEL_CLUB } from "@/lib/kajabi";
import { invitarASkool } from "@/lib/skool";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("renovarMembresia");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const clienteId = decodeURIComponent(id);

  try {
    // Campos propios del CRM (etiqueta, tipo de membresía, acceso a
    // plataforma, fin de acceso) — no depende de que Kajabi/Skool respondan.
    let cliente = await renovarMembresia(clienteId, permiso.usuario.nombre);

    let avisoKajabi: string | null = null;
    try {
      const kajabiContactId = await altaEnKajabi(cliente.nombre, cliente.email);
      await vincularKajabiContactId(cliente.id, kajabiContactId);
      await registrarTagKajabi(cliente.email, cliente.nombre, KAJABI_TAG_MIEMBRO_DEL_CLUB);
    } catch (err) {
      avisoKajabi = err instanceof Error ? err.message : "No se pudo otorgar el acceso en Kajabi";
    }
    // Fuera del try de Kajabi a propósito: renovarMembresia ya cambió
    // acceso a plataforma/tipo de membresía/fecha de renovación, que
    // alimentan el cálculo de boletos sin importar si Kajabi respondió —
    // si Kajabi falla, la fila no debe quedar con la etiqueta "Renovación"
    // nueva pero los boletos del evento viejo.
    cliente = await recalcularAccesos(cliente.id);

    let avisoSkool: string | null = null;
    try {
      await invitarASkool(cliente.email);
      cliente = await marcarInvitacionSkoolEnviada(cliente.id, new Date().toISOString());
    } catch (err) {
      avisoSkool = err instanceof Error ? err.message : "No se pudo enviar la invitación a Skool";
    }

    return NextResponse.json({ cliente, avisoKajabi, avisoSkool });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
