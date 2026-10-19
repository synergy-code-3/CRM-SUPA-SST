import { NextRequest, NextResponse } from "next/server";
import { autorizadoParaCron } from "@/lib/cron-auth";
import { limpiarFlyersVencidos } from "@/lib/coordinacion";

export const maxDuration = 60;

// Borra los flyers (PNG en Storage + flyer_url) de mentorías con más de 30
// días desde su fecha — ver limpiarFlyersVencidos() en coordinacion.ts.
// Invocado una vez al día por el Cron Job de Vercel (ver vercel.json).
async function manejar(req: NextRequest) {
  if (!autorizadoParaCron(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const resultado = await limpiarFlyersVencidos();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export const GET = manejar;
export const POST = manejar;
