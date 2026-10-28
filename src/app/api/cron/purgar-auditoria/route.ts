import { NextRequest, NextResponse } from "next/server";
import { autorizadoParaCron } from "@/lib/cron-auth";
import { purgarAuditoria, RETENCION_AUDITORIA_DIAS } from "@/lib/captura-datos/auditoria";

export const maxDuration = 60;

// Borra del historial de Captura de Datos (cap_auditoria) lo que tenga más de RETENCION_AUDITORIA_DIAS días.
// Invocado una vez por semana por el Cron Job de Vercel (ver vercel.json).
async function manejar(req: NextRequest) {
  if (!autorizadoParaCron(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const borrados = await purgarAuditoria();
    return NextResponse.json({ ok: true, borrados, dias: RETENCION_AUDITORIA_DIAS });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export const GET = manejar;
export const POST = manejar;
