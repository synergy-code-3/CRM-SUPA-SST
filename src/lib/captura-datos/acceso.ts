// Control de acceso por evento: el admin ve todo; coordinador/abeja solo los
// eventos a los que están asignados. Se responde 404 (no 403) para no revelar
// que un evento o una hoja ajenos existen.
import { ErrorPeticion } from "./errores";
import { obtenerHoja, usuarioAsignado } from "./db";
import type { HojaCaptura } from "./modelo";
import type { Usuario } from "./sesion";

export async function requerirEvento(usuario: Usuario, eventoId: string): Promise<void> {
  if (usuario.rol === "admin") return;
  if (!(await usuarioAsignado(eventoId, usuario.id))) throw new ErrorPeticion(404, "No encontrado");
}

/** Carga la hoja y comprueba el acceso a su evento. */
export async function requerirHoja(usuario: Usuario, hojaId: string): Promise<HojaCaptura> {
  const hoja = await obtenerHoja(hojaId);
  if (!hoja) throw new ErrorPeticion(404, "No encontrada");
  await requerirEvento(usuario, hoja.eventoId);
  return hoja;
}
