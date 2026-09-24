import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { obtenerClienteCertificacion } from "@/lib/certificaciones";
import { invitarASkoolCertificaciones } from "@/lib/skool";
import { supabase } from "@/lib/supabase";

// Reintenta el aviso a Skool sin tocar el estado del cliente (para cuando el
// envío original falló o el cliente no recibió el link).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("gestionarCertificaciones");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const clienteId = decodeURIComponent(id);
  const cliente = await obtenerClienteCertificacion(clienteId);
  if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  if (!cliente.email) return NextResponse.json({ error: "Este cliente no tiene correo" }, { status: 400 });

  try {
    await invitarASkoolCertificaciones(cliente.email);
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo invitar a Skool";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  await supabase.from("certificaciones_eventos").insert({
    cliente_id: clienteId,
    tipo: "INVITACION_ENVIADA",
    autor: permiso.usuario.nombre,
    nota: "Invitación a Skool reenviada",
  });
  return NextResponse.json({ ok: true });
}
