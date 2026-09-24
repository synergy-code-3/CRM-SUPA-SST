import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { listarActividadCertificacion } from "@/lib/certificaciones";

// ?desde=ISO&hasta=ISO&autor=Nombre (opcional)
export async function GET(req: NextRequest) {
  const permiso = await requerirPermiso("gestionarCertificaciones");
  if (!permiso.ok) return permiso.respuesta;

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  if (!desde || !hasta || Number.isNaN(Date.parse(desde)) || Number.isNaN(Date.parse(hasta))) {
    return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 });
  }

  try {
    const data = await listarActividadCertificacion({ desde, hasta, autor: searchParams.get("autor") || undefined });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
