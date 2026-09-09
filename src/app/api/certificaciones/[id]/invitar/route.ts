import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { enviarInvitacionCertificacion, obtenerClienteCertificacion } from "@/lib/certificaciones";
import { invitarASkoolCertificaciones } from "@/lib/skool";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("gestionarCertificaciones");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const clienteId = decodeURIComponent(id);

  try {
    const cliente = await obtenerClienteCertificacion(clienteId);
    if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

    await enviarInvitacionCertificacion(clienteId, permiso.usuario.nombre);

    let avisoSkool: string | null = null;
    if (cliente.email) {
      try {
        await invitarASkoolCertificaciones(cliente.email);
      } catch (err) {
        avisoSkool = err instanceof Error ? err.message : "No se pudo invitar a Skool";
      }
    }

    return NextResponse.json({ ok: true, avisoSkool });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
