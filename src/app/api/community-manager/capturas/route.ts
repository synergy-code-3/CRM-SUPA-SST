import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { subirCapturaComentario } from "@/lib/storage";

// Sube la captura de un comentario ANTES de que exista el registro de la
// publicación — el cliente genera un id (randomUUID) para el registro y lo
// reusa como carpeta aquí y como `id` al guardar en
// POST /api/community-manager/publicaciones, para que la imagen y la fila
// terminen enlazadas aunque se suban en pasos separados.
export async function POST(req: NextRequest) {
  const permiso = await requerirPermiso("verCommunityManager");
  if (!permiso.ok) return permiso.respuesta;

  const form = await req.formData();
  const publicacionId = String(form.get("publicacionId") ?? "").trim();
  const archivo = form.get("archivo");
  if (!publicacionId || !(archivo instanceof File) || archivo.size === 0) {
    return NextResponse.json({ error: "Falta el archivo o el id de la publicación" }, { status: 400 });
  }

  try {
    const url = await subirCapturaComentario(publicacionId, archivo);
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo subir la captura";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
