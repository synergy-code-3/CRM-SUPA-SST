// Borrado de eventos: lo hace directamente cualquier admin (con motivo, que se pide en pantalla); no hay solicitud, pero
// queda un movimiento en el historial (auditoria.ts) con el nombre del evento, el motivo y cuántas hojas tenía.
import { registrarAuditoria } from "./auditoria";
import { ErrorPeticion } from "./errores";
import { eliminarEvento, listarHojasDeEvento, obtenerEvento } from "./db";
import type { Usuario } from "./sesion";

/** Borra el evento y, en cascada, sus hojas. */
export async function borrarEventoDirecto(usuario: Usuario, eventoId: string, motivo: string): Promise<void> {
  if (usuario.rol !== "admin") throw new ErrorPeticion(403, "Solo un admin puede borrar un evento.");
  const motivoLimpio = motivo.trim();
  if (!motivoLimpio) throw new ErrorPeticion(400, "Indica el motivo del borrado.");
  const evento = await obtenerEvento(eventoId);
  if (!evento) throw new ErrorPeticion(404, "No encontrado");
  const hojas = await listarHojasDeEvento(eventoId);
  await eliminarEvento(eventoId);
  // Después de borrar (si el borrado falla no queda un registro falso) y con el nombre y el resumen, porque el evento ya no existirá.
  await registrarAuditoria({
    usuario,
    accion: "evento_borrado",
    eventoId,
    eventoNombre: evento.nombre,
    detalle: { motivo: motivoLimpio, fecha: evento.fecha, hojas: hojas.length, confirmadas: hojas.filter((h) => h.estado === "confirmada").length },
  });
}
