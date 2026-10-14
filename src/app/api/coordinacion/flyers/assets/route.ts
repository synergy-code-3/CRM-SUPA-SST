import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { listarFlyerAssets, guardarFlyerAsset, type CategoriaFlyerAsset } from "@/lib/coordinacion";

export async function GET() {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  try {
    const assets = await listarFlyerAssets();
    return NextResponse.json({ assets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudieron cargar las imágenes";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  const categoria = form?.get("categoria") as CategoriaFlyerAsset | null;
  const etiqueta = String(form?.get("etiqueta") ?? "").trim();
  if (!(archivo instanceof File) || !categoria || !etiqueta) {
    return NextResponse.json({ error: "Falta la imagen, la categoría o la etiqueta" }, { status: 400 });
  }
  if (categoria !== "fondo" && categoria !== "foto") {
    return NextResponse.json({ error: "Categoría inválida" }, { status: 400 });
  }

  try {
    const asset = await guardarFlyerAsset(categoria, etiqueta, archivo, permiso.usuario.nombre);
    return NextResponse.json({ asset });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo subir la imagen";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
