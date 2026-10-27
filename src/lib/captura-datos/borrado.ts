// Borrado de eventos: lo hace directamente cualquier admin (con motivo, que se pide en pantalla); no hay solicitud ni historial.
import { ErrorPeticion } from "./errores";
import { eliminarEvento, obtenerEvento } from "./db";
import type { Usuario } from "./sesion";

/** Borra el evento y, en cascada, sus hojas. */
export async function borrarEventoDirecto(usuario: Usuario, eventoId: string, motivo: string): Promise<void> {
  if (usuario.rol !== "admin") throw new ErrorPeticion(403, "Solo un admin puede borrar un evento.");
  const motivoLimpio = motivo.trim();
  if (!motivoLimpio) throw new ErrorPeticion(400, "Indica el motivo del borrado.");
  const evento = await obtenerEvento(eventoId);
  if (!evento) throw new ErrorPeticion(404, "No encontrado");
  await eliminarEvento(eventoId);
}
