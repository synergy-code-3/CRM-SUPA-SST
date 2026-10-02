import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { crearAtencionSkool, listarAtencionesSkool } from "@/lib/community-manager";

export async function GET(req: NextRequest) {
  const permiso = await requerirPermiso("verCommunityManager");
  if (!permiso.ok) return permiso.respuesta;

  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  try {
    const atenciones = await listarAtencionesSkool(q);
    return NextResponse.json({ atenciones });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudieron cargar los registros";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const permiso = await requerirPermiso("verCommunityManager");
  if (!permiso.ok) return permiso.respuesta;

  const body = await req.json().catch(() => null);
  const fecha = String(body?.fecha ?? "").trim();
  const usuario = String(body?.usuario ?? "").trim();
  const pregunta = String(body?.pregunta ?? "").trim();
  const respuesta = String(body?.respuesta ?? "").trim();
  if (!fecha || !usuario || !pregunta || !respuesta) {
    return NextResponse.json({ error: "Fecha, usuario, pregunta y respuesta son obligatorios" }, { status: 400 });
  }

  try {
    const resultado = await crearAtencionSkool({
      fecha,
      usuario,
      pregunta,
      respuesta,
      creadoPorId: permiso.usuario.id,
      creadoPorNombre: permiso.usuario.nombre,
    });
    return NextResponse.json({ ok: true, id: resultado.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el registro";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
