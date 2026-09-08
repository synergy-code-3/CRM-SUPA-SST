import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { obtenerImportacionCsv } from "@/lib/importaciones-csv";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verActividad");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const importacion = await obtenerImportacionCsv(id);
  if (!importacion) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json({ importacion });
}
