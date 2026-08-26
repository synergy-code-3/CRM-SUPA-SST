import { NextRequest, NextResponse } from "next/server";
import { hashPassword, requerirPermiso } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { ROLES, type Rol } from "@/lib/permisos";

// Evita que una edición/borrado deje al CRM sin ningún admin activo capaz de
// entrar al panel de usuarios. `excluirId` es la fila que se está por
// cambiar/borrar (se cuenta el resto tal como quedaría después).
async function quedaAlMenosUnAdminActivo(excluirId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("usuarios")
    .select("id", { count: "exact", head: true })
    .eq("rol", "admin")
    .eq("activo", true)
    .neq("id", excluirId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("gestionarUsuarios");
  if (!permiso.ok) return permiso.respuesta;
  const { id } = await params;

  const { data: fila, error: errLectura } = await supabase
    .from("usuarios")
    .select("id,rol,activo,token_version,primera_aprobacion_en")
    .eq("id", id)
    .maybeSingle();
  if (errLectura) throw errLectura;
  if (!fila) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const cambios: Record<string, unknown> = { actualizado_en: new Date().toISOString() };
  let requiereNuevaVersion = false;

  if (body?.rol !== undefined) {
    const rol = body.rol as Rol;
    if (!ROLES.includes(rol)) return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    if (fila.rol === "admin" && rol !== "admin" && !(await quedaAlMenosUnAdminActivo(id))) {
      return NextResponse.json({ error: "No puede quedar sin administradores activos" }, { status: 400 });
    }
    cambios.rol = rol;
    requiereNuevaVersion = true;
  }

  if (body?.activo !== undefined) {
    const activo = Boolean(body.activo);
    if (fila.rol === "admin" && !activo && !(await quedaAlMenosUnAdminActivo(id))) {
      return NextResponse.json({ error: "No puede quedar sin administradores activos" }, { status: 400 });
    }
    cambios.activo = activo;
    // Se queda fija para siempre desde la primera vez que se activa —
    // distingue un autoregistro que nunca fue aprobado (badge "Pendiente
    // de aprobar" en la lista) de una cuenta que un admin desactivó
    // después de haberla aprobado alguna vez.
    if (activo && !fila.primera_aprobacion_en) cambios.primera_aprobacion_en = new Date().toISOString();
    requiereNuevaVersion = true;
  }

  if (body?.nuevaPassword !== undefined) {
    const nuevaPassword = String(body.nuevaPassword);
    if (nuevaPassword.length < 8) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
    }
    cambios.password_hash = await hashPassword(nuevaPassword);
    requiereNuevaVersion = true;
  }

  if (Object.keys(cambios).length === 1) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }
  // Cualquiera de los tres cambios invalida las sesiones ya abiertas de este
  // usuario (obtenerUsuarioActual compara token_version contra el JWT).
  if (requiereNuevaVersion) cambios.token_version = fila.token_version + 1;

  const { data, error } = await supabase
    .from("usuarios")
    .update(cambios)
    .eq("id", id)
    .select("id,email,nombre,rol,activo,creado_en,ultimo_login,primera_aprobacion_en")
    .single();
  if (error) throw error;

  return NextResponse.json({ usuario: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("gestionarUsuarios");
  if (!permiso.ok) return permiso.respuesta;
  const { id } = await params;

  const { data: fila, error: errLectura } = await supabase
    .from("usuarios")
    .select("id,rol,activo")
    .eq("id", id)
    .maybeSingle();
  if (errLectura) throw errLectura;
  if (!fila) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  if (fila.rol === "admin" && fila.activo && !(await quedaAlMenosUnAdminActivo(id))) {
    return NextResponse.json({ error: "No puede quedar sin administradores activos" }, { status: 400 });
  }

  const { error } = await supabase.from("usuarios").delete().eq("id", id);
  if (error) throw error;

  return NextResponse.json({ ok: true });
}
