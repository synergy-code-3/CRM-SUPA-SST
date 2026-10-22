/**
 * Error cuyo mensaje es apto para mostrarse tal cual al usuario (datos inválidos, no encontrado, Drive sin conexión…).
 * Es la lista blanca de `respuestaError`: cualquier otro error se oculta tras un mensaje genérico.
 */
export class ErrorPeticion extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
