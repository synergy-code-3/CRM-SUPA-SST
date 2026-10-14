import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { eliminarFlyerAsset } from "@/lib/coordinacion";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    await eliminarFlyerAsset(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo eliminar la imagen";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
