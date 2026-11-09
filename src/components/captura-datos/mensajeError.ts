import { ErrorApi } from "@/lib/captura-datos/cliente";

/** Solo se muestra el mensaje que viene de la API; cualquier otro error (red, JSON, TypeError) usa el texto genérico. */
export function mensajeError(err: unknown, generico: string): string {
  return err instanceof ErrorApi ? err.message : generico;
}
