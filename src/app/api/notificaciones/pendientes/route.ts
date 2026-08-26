import { NextResponse } from "next/server";
import { obtenerUsuarioActual } from "@/lib/auth";
import { tienePermiso } from "@/lib/permisos";
import { contarSolicitudesPendientes } from "@/lib/solicitudes";
import { supabase } from "@/lib/supabase";

// Conteos para las burbujas del menú lateral (Solicitudes / Usuarios). Cada
// conteo solo se calcula si el rol puede hacer algo con eso — para todos
// los demás roles queda en 0, para no dar información de más y para no
// gastar una consulta que no va a usar.
export async function GET() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const [solicitudes, usuarios] = await Promise.all([
    tienePermiso(usuario.rol, "revisarSolicitudes") ? contarSolicitudesPendientes() : Promise.resolve(0),
    tienePermiso(usuario.rol, "gestionarUsuarios") ? contarUsuariosPendientes() : Promise.resolve(0),
  ]);

  return NextResponse.json({ solicitudes, usuarios });
}

async function contarUsuariosPendientes(): Promise<number> {
  const { count, error } = await supabase
    .from("usuarios")
    .select("id", { count: "exact", head: true })
    .eq("activo", false)
    .is("primera_aprobacion_en", null);
  if (error) throw error;
  return count ?? 0;
}
