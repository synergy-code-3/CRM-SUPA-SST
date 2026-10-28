import { registrarAuditoria } from "./auditoria";
import { confirmarEvento, listarHojasDeEvento, obtenerEvento } from "./db";
import { generarExcelEvento } from "./excel";
import { renombrarFotosDeEvento } from "./google";
import type { Usuario } from "./sesion";
import { subirExcelEvento } from "@/lib/storage";

/** Hay al menos una confirmada y ninguna queda por revisar (las no válidas no cuentan). */
export function estaCompleto(estados: readonly string[]): boolean {
  return estados.some((e) => e === "confirmada") && estados.every((e) => e === "confirmada" || e === "no_valida");
}

/** Cierra el evento (sin tocar Drive) cuando ya no quedan hojas por revisar. Devuelve true si lo cerró. */
export async function cerrarEventoSiCompleto(eventoId: string, usuario: Usuario): Promise<boolean> {
  const [evento, hojas] = await Promise.all([obtenerEvento(eventoId), listarHojasDeEvento(eventoId)]);
  if (!evento || evento.estado !== "abierto" || !estaCompleto(hojas.map((h) => h.estado))) return false;
  await confirmarEvento(eventoId, usuario.id, evento.drive);
  await registrarAuditoria({ usuario, accion: "evento_cerrado_auto", eventoId, eventoNombre: evento.nombre });
  try {
    await subirExcelEvento(eventoId, await generarExcelEvento(hojas));
  } catch (err) {
    console.error("captura-datos: no se pudo generar el Excel al cerrar el evento", err);
  }
  await renombrarFotosDeEvento(eventoId).catch((err) => console.error("captura-datos: no se pudieron renombrar las fotos al cerrar", err));
  return true;
}
