import { NextRequest, NextResponse } from "next/server";
import { requerirHoja } from "@/lib/captura-datos/acceso";
import { requerirPermiso } from "@/lib/auth";
import { ErrorEstadoHoja, ErrorHojaOcupada, exigirEventoAbiertoSiConfirmada, liberarHojasDeOtroEstatus, registrarCapturista, tomarHojaPorId } from "@/lib/captura-datos/db";
import { bloqueadaPorOtra } from "@/lib/captura-datos/colaboracion";
import { respuestaError } from "@/lib/captura-datos/api";

// Abre una hoja concreta desde su tarjeta (tomar-hoja del evento solo da "la siguiente libre").
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    const previa = await requerirHoja(permiso.usuario, id);
    await exigirEventoAbiertoSiConfirmada(previa);
    // Antes de registrar: abrir una hoja ajena no debe mover a la persona de estado ni gastar su cupo.
    if (bloqueadaPorOtra(previa, permiso.usuario.id)) throw new ErrorHojaOcupada();
    await registrarCapturista(previa.eventoId, permiso.usuario.id, previa.estatus);
    const hoja = await tomarHojaPorId(id, permiso.usuario.id);
    await liberarHojasDeOtroEstatus(previa.eventoId, permiso.usuario.id, previa.estatus);
    return NextResponse.json({ hoja });
  } catch (err) {
    if (err instanceof ErrorHojaOcupada || err instanceof ErrorEstadoHoja) return NextResponse.json({ error: err.message }, { status: 409 });
    return respuestaError(err, "captura-datos/hojas/[id]/tomar POST");
  }
}
