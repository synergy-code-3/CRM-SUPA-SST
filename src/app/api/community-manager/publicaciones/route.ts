import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { crearRegistroPublicacion, PLATAFORMAS_VALIDAS, type Plataforma } from "@/lib/community-manager";

export async function POST(req: NextRequest) {
  const permiso = await requerirPermiso("verCommunityManager");
  if (!permiso.ok) return permiso.respuesta;

  const body = await req.json().catch(() => null);
  const plataforma = body?.plataforma as Plataforma;
  if (!PLATAFORMAS_VALIDAS.includes(plataforma)) {
    return NextResponse.json({ error: "Plataforma inválida" }, { status: 400 });
  }
  const enlace = String(body?.enlace ?? "").trim();
  const tipoPublicacion = String(body?.tipoPublicacion ?? "").trim();
  const fechaRevision = String(body?.fechaRevision ?? "").trim();
  if (!enlace || !tipoPublicacion || !fechaRevision) {
    return NextResponse.json({ error: "Enlace, tipo de publicación y fecha de revisión son obligatorios" }, { status: 400 });
  }
  const comentarios = Array.isArray(body?.comentarios) ? body.comentarios : [];

  try {
    const resultado = await crearRegistroPublicacion({
      id: typeof body?.id === "string" ? body.id : undefined,
      plataforma,
      enlace,
      tipoPublicacion,
      fechaRevision,
      cantidadComentarios: Number(body?.cantidadComentarios) || 0,
      cantidadInteracciones: Number(body?.cantidadInteracciones) || 0,
      esPauta: body?.esPauta === "Sí" || body?.esPauta === true,
      notas: body?.notas ?? null,
      comentarios,
      creadoPorId: permiso.usuario.id,
      creadoPorNombre: permiso.usuario.nombre,
    });
    return NextResponse.json({ ok: true, id: resultado.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el registro";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
