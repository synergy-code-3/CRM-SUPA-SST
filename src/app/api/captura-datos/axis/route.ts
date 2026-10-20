import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { buscarPorTelefono } from "@/lib/captura-datos/axis";
import { leerJson, respuestaError } from "@/lib/captura-datos/api";
import { consultaAxis } from "@/lib/captura-datos/validacion";

export async function POST(req: NextRequest) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  try {
    const b = await leerJson(req, consultaAxis);
    const resultado = await buscarPorTelefono(b.telefono);
    return NextResponse.json(resultado);
  } catch (err) {
    return respuestaError(err, "captura-datos/axis POST");
  }
}
