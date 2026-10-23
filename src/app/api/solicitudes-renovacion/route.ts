import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { listarSolicitudesRenovacionExterna } from "@/lib/solicitudes-renovacion";

// Mismo permiso que revisar las Solicitudes de alta — es el mismo equipo
// (admin) el que decide ambas cosas.
export async function GET() {
  const permiso = await requerirPermiso("revisarSolicitudes");
  if (!permiso.ok) return permiso.respuesta;

  const solicitudes = await listarSolicitudesRenovacionExterna();
  return NextResponse.json({ solicitudes });
}
