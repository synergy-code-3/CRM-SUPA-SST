import { NextRequest, NextResponse } from "next/server";
import { sincronizarSolicitudesVsl } from "@/lib/sincronizar-vsl";

export const maxDuration = 60;

// Llamador externo (cron de GitHub Actions, cada ~15 min): revisa los
// "convertidos" del CRM de VSL (Soporte) sin acceso dado todavía y crea una
// Solicitud pendiente por cada uno nuevo, lista para que un admin la
// revise y apruebe — ver src/lib/sincronizar-vsl.ts.
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token || token !== process.env.CRON_SECRET) {
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
