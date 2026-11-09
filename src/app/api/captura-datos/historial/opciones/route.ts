import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { respuestaError } from "@/lib/captura-datos/api";

// Eventos existentes y admins para los filtros del historial y del reporte de captura. Solo admin.
export async function GET() {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;
  if (permiso.usuario.rol !== "admin") return NextResponse.json({ error: "No tienes permiso para esto" }, { status: 403 });

  try {
    const [eventos, admins] = await Promise.all([
      supabase.from("cap_eventos").select("id, nombre").order("creado_en", { ascending: false }),
      supabase.from("usuarios").select("id, nombre").eq("rol", "admin").order("nombre", { ascending: true }),
    ]);
    if (eventos.error) throw eventos.error;
    if (admins.error) throw admins.error;
    return NextResponse.json({ eventos: eventos.data, admins: admins.data });
  } catch (err) {
    return respuestaError(err, "captura-datos/historial/opciones GET");
  }
}
