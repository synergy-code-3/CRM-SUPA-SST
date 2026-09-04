import { NextResponse } from "next/server";
import { obtenerUsuarioActual } from "@/lib/auth";
import { contarAvisosPendientes } from "@/lib/avisos";
import { tienePermiso } from "@/lib/permisos";
import { contarSolicitudesPendientes } from "@/lib/solicitudes";
import { supabase } from "@/lib/supabase";

// Conteos para las burbujas del menú lateral (Solicitudes / Usuarios /
// Avisos). Solicitudes y Usuarios solo se calculan si el rol puede hacer
// algo con eso — para los demás roles quedan en 0, para no gastar una
// consulta que no va a usar. Avisos es distinto: cualquier rol puede tener
// avisos sin confirmar, así que ese conteo siempre se calcula.
export async function GET() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const [solicitudes, usuarios, avisos] = await Promise.all([
    tienePermiso(usuario.rol, "revisarSolicitudes") ? contarSolicitudesPendientes() : Promise.resolve(0),
    tienePermiso(usuario.rol, "gestionarUsuarios") ? contarUsuariosPendientes() : Promise.resolve(0),
    contarAvisosPendientes(usuario.id, usuario.rol === "admin"),
  ]);

  return NextResponse.json({ solicitudes, usuarios, avisos });
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
