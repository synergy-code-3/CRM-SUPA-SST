import { NextRequest, NextResponse } from "next/server";
import { obtenerUsuarioActual } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// Autogestión del propio perfil (teléfonos) — cualquier usuario autenticado
// puede editar el suyo, sin permiso especial. Nombre/correo/rol NO se tocan
// aquí: eso sigue siendo exclusivo de Usuarios (admin).
export async function PATCH(req: NextRequest) {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.telefonos)) {
    return NextResponse.json({ error: "Faltan los teléfonos" }, { status: 400 });
  }
  const telefonos = body.telefonos
    .filter((t: unknown): t is string => typeof t === "string" && t.trim() !== "")
    .map((t: string) => t.trim());

  const patch: { telefonos: string[]; actualizado_en: string; abeja_activa?: boolean } = {
    telefonos,
    actualizado_en: new Date().toISOString(),
  };
  if (typeof body?.abejaActiva === "boolean") patch.abeja_activa = body.abejaActiva;

  const { error } = await supabase.from("usuarios").update(patch).eq("id", usuario.id);
  if (error) throw error;

  return NextResponse.json({ ok: true });
}
