import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { agruparEventosPorTipo } from "@/lib/boletos";

// Eventos del catálogo de Biblioteca agrupados en Webinar/Presencial/Otro,
// para el selector por categoría del formulario de Solicitudes. Gateado
// por "solicitarCliente" (no "verBiblioteca", que es admin-only) — lo usan
// los tres roles al llenar una solicitud.
export async function GET() {
  const permiso = await requerirPermiso("solicitarCliente");
  if (!permiso.ok) return permiso.respuesta;

  const eventos = await agruparEventosPorTipo();
  return NextResponse.json(eventos);
}
