import { NextResponse } from "next/server";
import { obtenerUsuarioActual } from "@/lib/auth";
import { contarAvisosPendientes } from "@/lib/avisos";
import { tienePermiso } from "@/lib/permisos";
import { contarSolicitudesInvalidasPropias, contarSolicitudesPendientes } from "@/lib/solicitudes";
import { contarSolicitudesCertificacionPendientes } from "@/lib/solicitudes-certificacion";
import { supabase } from "@/lib/supabase";

// Conteos para las burbujas del menú lateral (Solicitudes / Solicitudes de
// Certificaciones / Usuarios / Avisos). La mayoría solo se calculan si el
// rol puede hacer algo con eso — para los demás roles quedan en 0, para no
// gastar una consulta que no va a usar. Avisos es distinto: cualquier rol
// puede tener avisos sin confirmar, así que ese conteo siempre se calcula.
export async function GET() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const [solicitudes, solicitudesCertificacion, usuarios, avisos] = await Promise.all([
    // Para quien revisa, la burbuja cuenta pendientes de TODOS; para quien
    // no, cuenta sus propias solicitudes marcadas "correo inválido" (algo
    // que sí le toca a él resolver en esta misma página).
    tienePermiso(usuario.rol, "revisarSolicitudes")
      ? contarSolicitudesPendientes()
      : contarSolicitudesInvalidasPropias(usuario.id),
    tienePermiso(usuario.rol, "revisarSolicitudesCertificacion")
      ? contarSolicitudesCertificacionPendientes()
      : Promise.resolve(0),
    tienePermiso(usuario.rol, "gestionarUsuarios") ? contarUsuariosPendientes() : Promise.resolve(0),
    contarAvisosPendientes(usuario.id, usuario.rol === "admin"),
  ]);

  return NextResponse.json({ solicitudes, solicitudesCertificacion, usuarios, avisos });
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
