import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { agregarEtiquetaExtra, quitarEtiquetaExtra } from "@/lib/db";

// Etiquetas adicionales a la principal (ver Cliente.etiquetasExtra, types.ts)
// — el "+ Agregar etiqueta" del panel del cliente.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("editarCliente");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const clienteId = decodeURIComponent(id);
  const body = await req.json().catch(() => ({}));
  if (!body?.etiqueta?.trim()) return NextResponse.json({ error: "Falta la etiqueta" }, { status: 400 });

  try {
    const cliente = await agregarEtiquetaExtra(clienteId, body.etiqueta, permiso.usuario.nombre);
    return NextResponse.json({ cliente });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo agregar la etiqueta";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("editarCliente");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const clienteId = decodeURIComponent(id);
  const etiqueta = req.nextUrl.searchParams.get("etiqueta");
  if (!etiqueta?.trim()) return NextResponse.json({ error: "Falta la etiqueta" }, { status: 400 });

  try {
    const cliente = await quitarEtiquetaExtra(clienteId, etiqueta, permiso.usuario.nombre);
    return NextResponse.json({ cliente });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo quitar la etiqueta";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
