import { NextRequest, NextResponse } from "next/server";
import { autorizadoParaCron } from "@/lib/cron-auth";
import { sincronizarSolicitudesVsl } from "@/lib/sincronizar-vsl";

export const maxDuration = 60;

// Revisa los "convertidos" del CRM de VSL (Soporte) sin acceso dado todavía
// y crea una Solicitud pendiente por cada uno nuevo, lista para que un
// admin la revise y apruebe — ver src/lib/sincronizar-vsl.ts. Invocado cada
// ~15 min por el Cron Job de Vercel (ver vercel.json) — el cron de GitHub
// Actions que se usaba antes no era confiable para intervalos cortos (podía
// tardar horas en dispararse), se dejó solo como respaldo manual.
async function manejar(req: NextRequest) {
  if (!autorizadoParaCron(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const resultado = await sincronizarSolicitudesVsl();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export const GET = manejar;
export const POST = manejar;
