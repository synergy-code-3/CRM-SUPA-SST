import { NextRequest, NextResponse } from "next/server";
import { hashPassword, requerirPermiso } from "@/lib/auth";
import { normalizarEmail } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { ROLES, type Rol } from "@/lib/permisos";

export async function GET() {
  const permiso = await requerirPermiso("gestionarUsuarios");
  if (!permiso.ok) return permiso.respuesta;

  const { data, error } = await supabase
    .from("usuarios")
    .select("id,email,nombre,rol,activo,creado_en,ultimo_login,telefonos,foto_url,primera_aprobacion_en")
    .order("creado_en", { ascending: true });
  if (error) throw error;
  return NextResponse.json({ usuarios: data });
}

export async function POST(req: NextRequest) {
  const permiso = await requerirPermiso("gestionarUsuarios");
  if (!permiso.ok) return permiso.respuesta;

  const body = await req.json().catch(() => null);
  const nombre = body?.nombre?.trim();
  const email = body?.email?.trim() ? normalizarEmail(body.email) : "";
  const password = body?.password ?? "";
  const rol = body?.rol as Rol;

  if (!nombre || !email) {
    return NextResponse.json({ error: "Nombre y correo son obligatorios" }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
  }
  if (!ROLES.includes(rol)) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }

  const { data: existente } = await supabase.from("usuarios").select("id").eq("email", email).maybeSingle();
  if (existente) {
    return NextResponse.json({ error: "Ya existe un usuario con ese correo" }, { status: 400 });
  }

  const password_hash = await hashPassword(password);
  const { data, error } = await supabase
    .from("usuarios")
    .insert({
      nombre,
      email,
      password_hash,
      rol,
      activo: true,
      token_version: 1,
      primera_aprobacion_en: new Date().toISOString(),
    })
    .select("id,email,nombre,rol,activo,creado_en,ultimo_login,telefonos,foto_url,primera_aprobacion_en")
    .single();
  if (error) throw error;

  return NextResponse.json({ usuario: data });
}
