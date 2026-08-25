import { NextRequest, NextResponse } from "next/server";
import { normalizarEmail } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { hashPassword } from "@/lib/auth";

// Autoregistro público (sin sesión) desde /login. Siempre queda inactivo y
// con el rol de menor privilegio ("abeja") — un admin lo revisa y activa
// desde Usuarios (mismo interruptor Activo/Desactivado que ya existe ahí,
// sin tabla ni flujo aparte) y ahí también puede subirle el rol si aplica.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const nombre = body?.nombre?.trim();
  const email = body?.email?.trim() ? normalizarEmail(body.email) : "";
  const password = body?.password ?? "";

  if (!nombre || !email || !password) {
    return NextResponse.json({ error: "Nombre, correo y contraseña son obligatorios" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
  }

  const { data: existente } = await supabase.from("usuarios").select("id").eq("email", email).maybeSingle();
  if (existente) {
    return NextResponse.json({ error: "Ya existe una cuenta con ese correo" }, { status: 400 });
  }

  const password_hash = await hashPassword(password);
  const { error } = await supabase
    .from("usuarios")
    .insert({ nombre, email, password_hash, rol: "abeja", activo: false, token_version: 1 });
  if (error) throw error;

  return NextResponse.json({ ok: true });
}
