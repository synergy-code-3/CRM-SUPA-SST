import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { listarEventos, crearEvento } from "@/lib/coordinacion";

export async function GET(req: Request) {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");

  try {
    const eventos = await listarEventos(desde && hasta ? { desde, hasta } : undefined);
    return NextResponse.json({ eventos });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudieron cargar los eventos";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  const body = await req.json();
  const titulo = String(body?.titulo ?? "").trim();
  const fecha = String(body?.fecha ?? "");
  if (!titulo || !fecha) return NextResponse.json({ error: "Falta título o fecha" }, { status: 400 });

  try {
    const { id } = await crearEvento({
      titulo,
      fecha,
      color: body?.color,
      horaInicio: body?.horaInicio,
      horaFin: body?.horaFin,
      enlace: body?.enlace,
      invitados: body?.invitados,
      notas: body?.notas,
      descripcion: body?.descripcion,
      creadoPorId: permiso.usuario.id,
      creadoPorNombre: permiso.usuario.nombre,
    });
    return NextResponse.json({ id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo crear el evento";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
