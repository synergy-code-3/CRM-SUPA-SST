import { NextResponse } from "next/server";
import { obtenerSesionCruda } from "@/lib/auth";

// A diferencia del resto de rutas, usa obtenerSesionCruda() (no
// obtenerUsuarioActual()) a propósito: el front necesita saber que hay una
// sesión pendiente de aprobación (activo=false) para mostrar la pantalla de
// "acceso pendiente" — con obtenerUsuarioActual() se vería igual que no
// haber iniciado sesión.
export async function GET() {
  const usuario = await obtenerSesionCruda();
  if (!usuario) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json({ usuario });
}
