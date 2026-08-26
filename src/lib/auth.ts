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
  // false = cuenta autoregistrada (o desactivada) esperando que un admin la
  // active — obtenerUsuarioActual() nunca la deja pasar (sigue siendo null,
  // igual que siempre); solo obtenerSesionCruda() la expone, para que
  // /api/auth/me pueda mostrarle al front la pantalla de "acceso pendiente"
  // en vez de simplemente tratarla como sesión inexistente.
  activo: boolean;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verificarPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Verifica el JWT de la cookie Y relee el usuario en Supabase para confirmar
// que su rol/versión de sesión no cambiaron desde que se emitió el token.
// No filtra por `activo` — la cuenta puede estar pendiente de aprobación y
// aun así tener una sesión válida (ve la pantalla de "acceso pendiente" en
// vez de nada). El filtro de `activo` para autorizar de verdad vive en
// obtenerUsuarioActual(), no aquí.
export async function obtenerSesionCruda(): Promise<UsuarioSesion | null> {
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
  if (error || !data || data.token_version !== claims.tokenVersion) return null;

  return {
    id: data.id,
    email: data.email,
    nombre: data.nombre,
    rol: data.rol as Rol,
    telefonos: data.telefonos ?? [],
    fotoUrl: data.foto_url,
    activo: data.activo,
  };
}

// La única fuente de verdad de autorización real — se usa en todo route
// handler, nunca se confía solo en middleware.ts. A diferencia de
// obtenerSesionCruda(), una cuenta pendiente de aprobación (activo=false)
// sigue devolviendo null aquí: ningún permiso se evalúa para alguien sin
// aprobar todavía.
export async function obtenerUsuarioActual(): Promise<UsuarioSesion | null> {
  const sesion = await obtenerSesionCruda();
  if (!sesion || !sesion.activo) return null;
  return sesion;
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
