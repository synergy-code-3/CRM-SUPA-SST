import type { UsuarioSesion } from "@/lib/auth";

// Único criterio de "perfil completo" del CRM — usado tanto por el gate
// bloqueante de AppLayout (PerfilObligatorio) como por MiPerfilModal. Nombre
// y correo nunca quedan vacíos en la práctica (son obligatorios al crear el
// usuario), pero se revisan igual por si acaso — el requisito real de hoy es
// teléfono y foto.
export function perfilIncompleto(usuario: UsuarioSesion): boolean {
  return !usuario.nombre.trim() || !usuario.email.trim() || usuario.telefonos.length === 0 || !usuario.fotoUrl;
}
