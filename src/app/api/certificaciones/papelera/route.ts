import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { listarPapeleraCertificacion } from "@/lib/certificaciones";

export async function GET() {
  const permiso = await requerirPermiso("gestionarCertificaciones");
  if (!permiso.ok) return permiso.respuesta;

  const clientes = await listarPapeleraCertificacion();
  return NextResponse.json({ clientes });
}
