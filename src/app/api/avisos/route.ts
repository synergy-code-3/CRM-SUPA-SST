import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { crearAviso, listarAvisos } from "@/lib/avisos";
import { subirImagenAviso } from "@/lib/storage";

export async function GET() {
  const permiso = await requerirPermiso("verAvisos");
  if (!permiso.ok) return permiso.respuesta;

  const avisos = await listarAvisos(permiso.usuario);
  return NextResponse.json({ avisos });
}

// FormData (no JSON) porque admite una imagen opcional, igual que las
// solicitudes con comprobante.
export async function POST(req: NextRequest) {
  const permiso = await requerirPermiso("gestionarAvisos");
  if (!permiso.ok) return permiso.respuesta;

  const form = await req.formData();
  const titulo = String(form.get("titulo") ?? "").trim();
  const mensaje = String(form.get("mensaje") ?? "").trim();
  if (!titulo || !mensaje) {
    return NextResponse.json({ error: "Título y mensaje son obligatorios" }, { status: 400 });
  }
  // "General" = sin destinatarios (se transmite por rol); "Personal" = uno o
  // varios ids de usuarios elegidos a mano.
  const destinatariosIds = String(form.get("destinatariosIds") ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const imagen = form.get("imagen");

  try {
    const id = randomUUID();
    let imagenUrl: string | null = null;
    if (imagen instanceof File && imagen.size > 0) {
      imagenUrl = await subirImagenAviso(id, imagen);
    }
    const aviso = await crearAviso(titulo, mensaje, permiso.usuario.id, permiso.usuario.nombre, {
      id,
      destinatariosIds,
      imagenUrl,
    });
    return NextResponse.json({ aviso });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo crear el aviso";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
