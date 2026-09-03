import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { listarAvisosPendientes } from "@/lib/avisos";

// Endpoint que hace polling Sidebar.tsx (cada ~30s) para saber si hay
// avisos sin confirmar — es lo que dispara la ventana emergente bloqueante.
export async function GET() {
  const permiso = await requerirPermiso("verAvisos");
  if (!permiso.ok) return permiso.respuesta;

  const avisos = await listarAvisosPendientes(permiso.usuario.id);
  return NextResponse.json({ avisos });
}
