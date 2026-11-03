import { NextRequest, NextResponse } from "next/server";
import { requerirEvento } from "@/lib/captura-datos/acceso";
import { requerirPermiso } from "@/lib/auth";
import { liberarHojasDeUsuario } from "@/lib/captura-datos/db";
import { respuestaError } from "@/lib/captura-datos/api";

// Suelta las hojas que quien llama tiene tomadas en el evento (p. ej. se le cerró la pestaña): nunca las de otra persona.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    await requerirEvento(permiso.usuario, id);
    const liberadas = await liberarHojasDeUsuario(id, permiso.usuario.id);
    return NextResponse.json({ liberadas });
  } catch (err) {
    return respuestaError(err, "captura-datos/eventos/[id]/liberar-mis-hojas POST");
  }
}
