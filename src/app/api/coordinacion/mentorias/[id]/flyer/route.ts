import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { guardarFlyerMentoria } from "@/lib/coordinacion";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta el flyer" }, { status: 400 });
  }

  try {
    const flyerUrl = await guardarFlyerMentoria(id, archivo);
    return NextResponse.json({ flyerUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el flyer";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
