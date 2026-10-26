// Borrado de eventos: lo hace directamente cualquier admin, con motivo; queda registrado en el historial (cap_solicitudes_borrado).
import { ErrorPeticion } from "./errores";
import { eliminarEvento, obtenerEvento, registrarBorradoDirecto } from "./db";
import type { Usuario } from "./sesion";

/** Registra el borrado en el historial y luego borra el evento. */
export async function borrarEventoDirecto(usuario: Usuario, eventoId: string, motivo: string): Promise<void> {
  if (usuario.rol !== "admin") throw new ErrorPeticion(403, "Solo un admin puede borrar un evento.");
  const motivoLimpio = motivo.trim();
  if (!motivoLimpio) throw new ErrorPeticion(400, "Indica el motivo del borrado.");
  const evento = await obtenerEvento(eventoId);
  if (!evento) throw new ErrorPeticion(404, "No encontrado");
  await registrarBorradoDirecto({ eventoId, eventoNombre: evento.nombre, motivo: motivoLimpio, adminId: usuario.id });
  await eliminarEvento(eventoId);
}
