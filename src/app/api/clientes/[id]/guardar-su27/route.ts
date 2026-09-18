import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { activarGuardaAccesoSu27 } from "@/lib/db";

// Solo se otorga desde el perfil del cliente en Clientes del Club — la
// pestaña "Guardan acceso SU27" de Otras Ofertas (donde cae una vez
// activado) solo ofrece quitarlo (ver .../quitar-su27).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("editarAccesos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;

  try {
    const cliente = await activarGuardaAccesoSu27(decodeURIComponent(id), permiso.usuario.nombre);
    return NextResponse.json({ cliente });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
