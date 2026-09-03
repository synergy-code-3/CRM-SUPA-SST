import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { crearAviso, listarAvisos } from "@/lib/avisos";

export async function GET() {
  const permiso = await requerirPermiso("verAvisos");
  if (!permiso.ok) return permiso.respuesta;

  const avisos = await listarAvisos(permiso.usuario.rol === "admin");
  return NextResponse.json({ avisos });
}

export async function POST(req: NextRequest) {
  const permiso = await requerirPermiso("gestionarAvisos");
  if (!permiso.ok) return permiso.respuesta;

  const body = await req.json();
  const titulo = String(body?.titulo ?? "").trim();
  const mensaje = String(body?.mensaje ?? "").trim();
  if (!titulo || !mensaje) {
    return NextResponse.json({ error: "Título y mensaje son obligatorios" }, { status: 400 });
  }

  const aviso = await crearAviso(titulo, mensaje, permiso.usuario.id, permiso.usuario.nombre);
  return NextResponse.json({ aviso });
}
