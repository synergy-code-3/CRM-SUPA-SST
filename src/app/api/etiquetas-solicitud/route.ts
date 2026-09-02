import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { listarCatalogo } from "@/lib/catalogo";

// Catálogo de etiquetas para el selector del formulario de Solicitudes.
// Gateado por "solicitarCliente" (no "verBiblioteca", que es admin-only) —
// mismo criterio que /api/eventos-synergy, lo usan los tres roles al llenar
// una solicitud.
export async function GET() {
  const permiso = await requerirPermiso("solicitarCliente");
  if (!permiso.ok) return permiso.respuesta;

  const opciones = await listarCatalogo("etiqueta");
  return NextResponse.json({ opciones });
}
