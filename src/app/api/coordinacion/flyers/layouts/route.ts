import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { listarFlyerLayouts, guardarFlyerLayout, TIPOS_MENTORIA_VALIDOS, type TipoMentoria } from "@/lib/coordinacion";

export async function GET() {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  try {
    const layouts = await listarFlyerLayouts();
    return NextResponse.json({ layouts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudieron cargar los ajustes";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  const body = await req.json();
  const tipoMentoria = body?.tipoMentoria as TipoMentoria;
  if (!TIPOS_MENTORIA_VALIDOS.includes(tipoMentoria)) {
    return NextResponse.json({ error: "Tipo de mentoría inválido" }, { status: 400 });
  }
  const cfg = body?.cfg;
  if (!cfg || typeof cfg !== "object") {
    return NextResponse.json({ error: "Faltan los ajustes" }, { status: 400 });
  }

  try {
    await guardarFlyerLayout(tipoMentoria, cfg);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el ajuste";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
