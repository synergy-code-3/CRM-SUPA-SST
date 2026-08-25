import { NextRequest, NextResponse } from "next/server";
import { obtenerUsuarioActual } from "@/lib/auth";
import { subirAvatar } from "@/lib/storage";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta la imagen" }, { status: 400 });
  }

  try {
    const fotoUrl = await subirAvatar(usuario.id, archivo);
    const { error } = await supabase
      .from("usuarios")
      .update({ foto_url: fotoUrl, actualizado_en: new Date().toISOString() })
      .eq("id", usuario.id);
    if (error) throw error;

    return NextResponse.json({ fotoUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo subir la imagen";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
