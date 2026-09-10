import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { listarCatalogo } from "@/lib/catalogo";

// Catálogo de certificaciones para el selector del formulario de
// Solicitudes de Certificaciones. Gateado por "solicitarCertificacion" (no
// "verBiblioteca", que es admin-only) — mismo criterio que
// /api/etiquetas-solicitud, lo usan los tres roles al llenar una solicitud.
export async function GET() {
  const permiso = await requerirPermiso("solicitarCertificacion");
  if (!permiso.ok) return permiso.respuesta;

  const opciones = await listarCatalogo("certificacion");
  return NextResponse.json({ opciones });
}
