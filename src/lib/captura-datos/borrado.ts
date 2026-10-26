// Borrado de eventos: quien trabaja el evento lo solicita con un motivo y cualquier admin decide si se borra;
// un admin también puede borrarlo directamente (queda registrado igual en el historial de solicitudes).
import { ErrorPeticion } from "./errores";
import { crearSolicitudBorrado, eliminarEvento, obtenerEvento, registrarBorradoDirecto, resolverSolicitudBorrado } from "./db";
import type { Usuario } from "./sesion";

export function esAprobadorBorrado(usuario: Pick<Usuario, "rol">): boolean {
  return usuario.rol === "admin";
}

async function eventoConMotivo(eventoId: string, motivo: string) {
  const motivoLimpio = motivo.trim();
  if (!motivoLimpio) throw new ErrorPeticion(400, "Indica el motivo del borrado.");
  const evento = await obtenerEvento(eventoId);
  if (!evento) throw new ErrorPeticion(404, "No encontrado");
  return { evento, motivoLimpio };
}

export async function solicitarBorrado(usuario: Usuario, eventoId: string, motivo: string): Promise<void> {
  const { evento, motivoLimpio } = await eventoConMotivo(eventoId, motivo);
  await crearSolicitudBorrado({ eventoId, eventoNombre: evento.nombre, motivo: motivoLimpio, solicitadaPorId: usuario.id });
}

/** Borrado directo de un admin: se registra en el historial (como aprobada por el mismo admin) y luego se borra. */
export async function borrarEventoDirecto(usuario: Usuario, eventoId: string, motivo: string): Promise<void> {
  if (!esAprobadorBorrado(usuario)) throw new ErrorPeticion(403, "Solo un admin puede borrar un evento directamente.");
  const { evento, motivoLimpio } = await eventoConMotivo(eventoId, motivo);
  await registrarBorradoDirecto({ eventoId, eventoNombre: evento.nombre, motivo: motivoLimpio, adminId: usuario.id });
  await eliminarEvento(eventoId);
}

export async function resolverBorrado(usuario: Usuario, solicitudId: string, aprobar: boolean): Promise<void> {
  if (!esAprobadorBorrado(usuario)) throw new ErrorPeticion(403, "No tienes permiso para resolver esta solicitud.");
  const solicitud = await resolverSolicitudBorrado(solicitudId, usuario.id, aprobar);
  if (!solicitud) throw new ErrorPeticion(404, "La solicitud ya fue resuelta o no existe.");
  if (aprobar) await eliminarEvento(solicitud.eventoId);
}
