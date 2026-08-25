import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabase } from "./supabase";
import { COOKIE_SESION, SESION_DURACION_SEG, crearTokenSesion, verificarTokenSesion } from "./jwt-edge";
import { tienePermiso, type Accion, type Rol } from "./permisos";

export { COOKIE_SESION, SESION_DURACION_SEG, crearTokenSesion };
export type { Rol };

export type UsuarioSesion = {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  telefonos: string[];
  fotoUrl: string | null;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verificarPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Verifica el JWT de la cookie Y relee el usuario en Supabase para confirmar
// que sigue activo y que su rol/versión de sesión no cambiaron desde que se
// emitió el token. Es la única fuente de verdad de autorización — se usa en
// todo route handler, nunca se confía solo en middleware.ts.
export async function obtenerUsuarioActual(): Promise<UsuarioSesion | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESION)?.value;
  if (!token) return null;

  const claims = await verificarTokenSesion(token);
  if (!claims) return null;

  const { data, error } = await supabase
    .from("usuarios")
    .select("id,email,nombre,rol,activo,token_version,telefonos,foto_url")
    .eq("id", claims.sub)
    .maybeSingle();
  if (error || !data || !data.activo || data.token_version !== claims.tokenVersion) return null;

  return {
    id: data.id,
    email: data.email,
    nombre: data.nombre,
    rol: data.rol as Rol,
    telefonos: data.telefonos ?? [],
    fotoUrl: data.foto_url,
  };
}

type ResultadoPermiso =
  | { ok: true; usuario: UsuarioSesion }
  | { ok: false; respuesta: NextResponse };

// Helper para route handlers: resuelve la sesión y valida el permiso
// requerido en un solo paso, devolviendo directamente la respuesta 401/403
// que hay que retornar si algo falla.
export async function requerirPermiso(accion: Accion): Promise<ResultadoPermiso> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) {
    return { ok: false, respuesta: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }
  if (!tienePermiso(usuario.rol, accion)) {
    return { ok: false, respuesta: NextResponse.json({ error: "No tienes permiso para esto" }, { status: 403 }) };
  }
  return { ok: true, usuario };
}
