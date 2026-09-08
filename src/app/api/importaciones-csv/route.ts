import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { guardarImportacionCsv, listarImportacionesCsv, type FilaImportacionCsv } from "@/lib/importaciones-csv";

export async function GET() {
  const permiso = await requerirPermiso("verActividad");
  if (!permiso.ok) return permiso.respuesta;

  const importaciones = await listarImportacionesCsv();
  return NextResponse.json({ importaciones });
}

export async function POST(req: NextRequest) {
  const permiso = await requerirPermiso("importarCsv");
  if (!permiso.ok) return permiso.respuesta;

  const body = await req.json();
  const filas = body?.filas as FilaImportacionCsv[] | undefined;
  if (!Array.isArray(filas) || filas.length === 0) {
    return NextResponse.json({ error: "Faltan las filas de la importación" }, { status: 400 });
  }

  const importacion = await guardarImportacionCsv(permiso.usuario.nombre, filas);
  return NextResponse.json({ importacion });
}
