import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { agregarOpcionCatalogo, eliminarOpcionCatalogo, listarCatalogo, type TipoCatalogo } from "@/lib/catalogo";

const TIPOS: TipoCatalogo[] = ["evento", "etiqueta", "tag", "certificacion", "tag_certificaciones"];

function tipoValido(tipo: string | null): tipo is TipoCatalogo {
  return !!tipo && (TIPOS as string[]).includes(tipo);
}

export async function GET(req: NextRequest) {
  const permiso = await requerirPermiso("verBiblioteca");
  if (!permiso.ok) return permiso.respuesta;

  const tipo = req.nextUrl.searchParams.get("tipo");
  if (!tipoValido(tipo)) return NextResponse.json({ error: "Tipo de catálogo inválido" }, { status: 400 });
  const opciones = await listarCatalogo(tipo);
  return NextResponse.json({ opciones });
}

export async function POST(req: NextRequest) {
  const permiso = await requerirPermiso("gestionarCatalogo");
  if (!permiso.ok) return permiso.respuesta;

  const body = await req.json();
  if (!tipoValido(body?.tipo)) return NextResponse.json({ error: "Tipo de catálogo inválido" }, { status: 400 });
  if (!body?.valor?.trim()) return NextResponse.json({ error: "Falta el valor" }, { status: 400 });
  try {
    await agregarOpcionCatalogo(body.tipo, body.valor);
    const opciones = await listarCatalogo(body.tipo);
    return NextResponse.json({ opciones });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const permiso = await requerirPermiso("gestionarCatalogo");
  if (!permiso.ok) return permiso.respuesta;

  const body = await req.json();
  if (!tipoValido(body?.tipo)) return NextResponse.json({ error: "Tipo de catálogo inválido" }, { status: 400 });
  if (!body?.valor?.trim()) return NextResponse.json({ error: "Falta el valor" }, { status: 400 });
  await eliminarOpcionCatalogo(body.tipo, body.valor);
  const opciones = await listarCatalogo(body.tipo);
  return NextResponse.json({ opciones });
}
