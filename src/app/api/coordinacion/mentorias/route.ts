import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { crearAvisoAutomatico } from "@/lib/avisos";
import { listarMentorias, crearMentoria, TIPOS_MENTORIA, TIPOS_MENTORIA_VALIDOS, type TipoMentoria } from "@/lib/coordinacion";

export async function GET(req: Request) {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  const { searchParams } = new URL(req.url);
  const tipoMentoria = (searchParams.get("tipo") as TipoMentoria) || undefined;
  const mentorId = searchParams.get("mentor") || undefined;

  try {
    const mentorias = await listarMentorias({ tipoMentoria, mentorId });
    return NextResponse.json({ mentorias });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudieron cargar las mentorías";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  const body = await req.json();
  const tipoMentoria = body?.tipoMentoria as TipoMentoria;
  const fecha = String(body?.fecha ?? "");
  if (!TIPOS_MENTORIA_VALIDOS.includes(tipoMentoria) || !fecha) {
    return NextResponse.json({ error: "Falta tipo de mentoría o fecha" }, { status: 400 });
  }

  try {
    const { id } = await crearMentoria({
      mentorId: body?.mentorId || null,
      tipoMentoria,
      tema: String(body?.tema ?? ""),
      fecha,
      hora: String(body?.hora ?? ""),
      material: !!body?.material,
      notas: String(body?.notas ?? ""),
      creadoPorId: permiso.usuario.id,
      creadoPorNombre: permiso.usuario.nombre,
    });
    await crearAvisoAutomatico(
      "Nueva mentoría programada",
      `Se agendó "${TIPOS_MENTORIA[tipoMentoria]?.label ?? tipoMentoria}" para el ${fecha}.`,
      true,
      "Coordinación"
    );
    return NextResponse.json({ id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo crear la mentoría";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
