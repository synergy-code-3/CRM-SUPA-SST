import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { quitarGuardaAccesoSu27 } from "@/lib/db";

// Se puede llamar tanto desde el perfil del cliente en Clientes del Club
// como desde el mini perfil de la pestaña "Guardan acceso SU27" en Otras
// Ofertas — mismo endpoint para ambos.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("editarAccesos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;

  try {
    const cliente = await quitarGuardaAccesoSu27(decodeURIComponent(id), permiso.usuario.nombre);
    return NextResponse.json({ cliente });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
