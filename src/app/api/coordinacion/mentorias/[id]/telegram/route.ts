import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { obtenerMentoria, actualizarDifusionMentoria } from "@/lib/coordinacion";
import { enviarFlyerATelegram } from "@/lib/telegram";

// Manda el flyer ya guardado + uno de los dos copys (previa o plataforma,
// elegido en el botón que se usó) al grupo de Telegram del equipo. Al
// mandarlo, marca sola la casilla "Telegram" del checklist de difusión —
// ya no hace falta marcarla a mano porque ya es cierto.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const cual = body?.cual === "plataforma" ? "plataforma" : "previa";

  try {
    const mentoria = await obtenerMentoria(id);
    if (!mentoria) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    if (!mentoria.flyerUrl) {
      return NextResponse.json({ error: "Esta mentoría todavía no tiene un flyer guardado" }, { status: 400 });
    }
    const texto = cual === "previa" ? mentoria.copyPrevia : mentoria.copyPlataforma;
    if (!texto?.trim()) {
      return NextResponse.json({ error: `Esta mentoría todavía no tiene copy de ${cual === "previa" ? "previa" : "plataforma"}` }, { status: 400 });
    }

    await enviarFlyerATelegram(texto, mentoria.flyerUrl);
    await actualizarDifusionMentoria(id, {
      copyPrevia: mentoria.copyPrevia ?? "",
      copyPlataforma: mentoria.copyPlataforma ?? "",
      checklist: { ...mentoria.difusion, telegram: true },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
