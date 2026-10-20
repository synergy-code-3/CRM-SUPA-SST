// Adaptador: en el proyecto original (un solo operador local) esto siempre
// devolvía un usuario falso ({id:"local", rol:"admin"}). Aquí usa la sesión
// real del CRM — necesario porque ahora varias personas usan la sección a
// la vez y hace falta saber quién es quién (bloqueos de hoja, confirmado
// por, etc.).
import { obtenerUsuarioActual } from "@/lib/auth";

export interface Usuario {
  id: string;
  nombre: string;
  rol: "admin" | "coordinador" | "abeja";
}

export async function usuarioActual(): Promise<Usuario | null> {
  const sesion = await obtenerUsuarioActual();
  if (!sesion) return null;
  return { id: sesion.id, nombre: sesion.nombre, rol: sesion.rol };
}
