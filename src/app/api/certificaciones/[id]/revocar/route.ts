import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { revocarClienteCertificacion } from "@/lib/certificaciones";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("gestionarCertificaciones");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const motivo = String(body?.motivo ?? "").trim();
  if (!motivo) return NextResponse.json({ error: "Indica el motivo de la revocación" }, { status: 400 });

  try {
    await revocarClienteCertificacion(decodeURIComponent(id), permiso.usuario.nombre, motivo);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
