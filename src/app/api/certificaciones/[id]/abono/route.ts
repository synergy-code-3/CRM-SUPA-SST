import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { registrarAbonoCertificacion } from "@/lib/certificaciones";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("gestionarCertificaciones");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const body = await req.json();
  const monto = Number(body?.monto);
  if (!Number.isFinite(monto) || monto === 0) {
    return NextResponse.json({ error: "Monto inválido" }, { status: 400 });
  }

  try {
    await registrarAbonoCertificacion(
      decodeURIComponent(id),
      permiso.usuario.nombre,
      monto,
      body.moneda || null,
      body.nota || null
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
