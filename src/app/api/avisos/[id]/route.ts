import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { editarAviso, eliminarAviso } from "@/lib/avisos";
import { subirImagenAviso } from "@/lib/storage";

// FormData (no JSON) para poder reemplazar/quitar la imagen al editar.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("gestionarAvisos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const form = await req.formData();
  const titulo = String(form.get("titulo") ?? "").trim();
  const mensaje = String(form.get("mensaje") ?? "").trim();
  if (!titulo || !mensaje) {
    return NextResponse.json({ error: "Título y mensaje son obligatorios" }, { status: 400 });
  }
  const imagen = form.get("imagen");
  const quitarImagen = form.get("quitarImagen") === "true";

  try {
    let imagenUrl: string | null | undefined;
    if (imagen instanceof File && imagen.size > 0) {
      imagenUrl = await subirImagenAviso(id, imagen);
    } else if (quitarImagen) {
      imagenUrl = null;
    }
    const aviso = await editarAviso(id, titulo, mensaje, imagenUrl);
    return NextResponse.json({ aviso });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el aviso";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("gestionarAvisos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  await eliminarAviso(id);
  return NextResponse.json({ ok: true });
}
