import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { agregarOpcionCatalogo, listarCatalogo } from "@/lib/catalogo";

// Motivos extra que cualquiera con acceso a Community Manager puede ir
// agregando desde el desplegable de Moderación (los 5 base — Spam,
// Ofensas, etc. — viven en ModeracionContenido.tsx, aquí solo los que se
// suman después, compartidos entre todos los usuarios).
export async function GET() {
  const permiso = await requerirPermiso("verCommunityManager");
  if (!permiso.ok) return permiso.respuesta;

  const opciones = await listarCatalogo("motivo_cm");
  return NextResponse.json({ opciones });
}

export async function POST(req: Request) {
  const permiso = await requerirPermiso("verCommunityManager");
  if (!permiso.ok) return permiso.respuesta;

  const body = await req.json();
  const valor = String(body?.valor ?? "").trim();
  if (!valor) return NextResponse.json({ error: "Falta el valor" }, { status: 400 });

  try {
    await agregarOpcionCatalogo("motivo_cm", valor);
  } catch (err) {
    // Ya existe: no es un error para este flujo (varios usuarios pueden
    // escribir el mismo motivo nuevo sin querer) — se sigue de largo.
    if (!(err instanceof Error && err.message === "Esa opción ya existe")) {
      const message = err instanceof Error ? err.message : "No se pudo agregar el motivo";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }
  const opciones = await listarCatalogo("motivo_cm");
  return NextResponse.json({ opciones });
}
