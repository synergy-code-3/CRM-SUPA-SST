import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { listarApartadosVencidos } from "@/lib/db";

// Alimenta la ventana emergente que aparece al cargar el CRM (ver
// useApartadosVencidos en Sidebar.tsx): clientes con "Apartado 50%" activo
// cuyo temporizador de 30 días ya se cumplió, para que un admin decida ahí
// mismo si revoca el acceso.
export async function GET() {
  const permiso = await requerirPermiso("revocarAccesoCliente");
  if (!permiso.ok) return permiso.respuesta;

  const vencidos = await listarApartadosVencidos();
  return NextResponse.json({ vencidos });
}
