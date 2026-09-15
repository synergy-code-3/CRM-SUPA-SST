"use client";

import { MiPerfilModal } from "./MiPerfilModal";

// Se muestra en vez del CRM completo (Sidebar + páginas) cuando hay sesión,
// la cuenta ya está activa, pero al usuario le falta teléfono y/o foto de
// perfil — ver AppLayout y perfilIncompleto() (lib/perfil.ts). Reutiliza el
// mismo MiPerfilModal de siempre (modo bloqueante=true: sin X, sin cerrar al
// hacer clic afuera) en vez de duplicar el formulario — ya cubre toda la
// pantalla con su propio overlay, así que no necesita un fondo aparte.
//
// El bloqueo se resuelve solo, no requiere a un admin: en cuanto el usuario
// completa su perfil y guarda, refrescar() dentro de MiPerfilModal trae la
// sesión actualizada, perfilIncompleto() deja de dar true, y AppLayout
// vuelve a montar el CRM normal en el siguiente render.
export function PerfilObligatorio() {
  return <MiPerfilModal onClose={() => {}} bloqueante />;
}
