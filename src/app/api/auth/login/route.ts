import { NextRequest, NextResponse } from "next/server";
import { normalizarEmail } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { COOKIE_SESION, SESION_DURACION_SEG, crearTokenSesion, verificarPassword } from "@/lib/auth";
import type { Rol } from "@/lib/permisos";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = body?.email?.trim() ? normalizarEmail(body.email) : "";
  const password = body?.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "Correo y contraseña son obligatorios" }, { status: 400 });
  }

  const { data: usuario, error } = await supabase
    .from("usuarios")
    .select("id,email,nombre,rol,activo,password_hash,token_version")
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;

  // No se filtra por `activo`: una cuenta pendiente de aprobación sí puede
  // iniciar sesión (ve la pantalla de "acceso pendiente" en vez del CRM) —
  // así el usuario nuevo se entera de que su cuenta ya existe, en vez de
  // ver el mismo error que si hubiera escrito mal la contraseña.
  if (!usuario || !(await verificarPassword(password, usuario.password_hash))) {
    return NextResponse.json({ error: "Correo o contraseña incorrectos" }, { status: 401 });
  }

  const token = await crearTokenSesion({
    sub: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    rol: usuario.rol as Rol,
    tokenVersion: usuario.token_version,
  });

  await supabase.from("usuarios").update({ ultimo_login: new Date().toISOString() }).eq("id", usuario.id);

  const res = NextResponse.json({
    usuario: { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol },
  });
  res.cookies.set(COOKIE_SESION, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESION_DURACION_SEG,
  });
  return res;
}
