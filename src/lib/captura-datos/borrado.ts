// Borrado de eventos con aprobación: un admin lo solicita con un motivo y solo la persona aprobadora decide si se borra.
import { ErrorPeticion } from "./errores";
import { crearSolicitudBorrado, eliminarEvento, obtenerEvento, resolverSolicitudBorrado } from "./db";
import type { Usuario } from "./sesion";

const NOMBRE_APROBADOR = "Samuel Otniel Diaz Gonzalez";

const normalizar = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");

export function esAprobadorBorrado(usuario: Pick<Usuario, "nombre">): boolean {
  return normalizar(usuario.nombre) === normalizar(NOMBRE_APROBADOR);
}

export async function solicitarBorrado(usuario: Usuario, eventoId: string, motivo: string): Promise<void> {
  if (usuario.rol !== "admin") throw new ErrorPeticion(403, "Solo un admin puede solicitar el borrado de un evento.");
  const motivoLimpio = motivo.trim();
  if (!motivoLimpio) throw new ErrorPeticion(400, "Indica el motivo del borrado.");
  const evento = await obtenerEvento(eventoId);
  if (!evento) throw new ErrorPeticion(404, "No encontrado");
  await crearSolicitudBorrado({ eventoId, eventoNombre: evento.nombre, motivo: motivoLimpio, solicitadaPorId: usuario.id });
}

export async function resolverBorrado(usuario: Usuario, solicitudId: string, aprobar: boolean): Promise<void> {
  if (!esAprobadorBorrado(usuario)) throw new ErrorPeticion(403, "No tienes permiso para resolver esta solicitud.");
  const solicitud = await resolverSolicitudBorrado(solicitudId, usuario.id, aprobar);
  if (!solicitud) throw new ErrorPeticion(404, "La solicitud ya fue resuelta o no existe.");
  if (aprobar) await eliminarEvento(solicitud.eventoId);
}
