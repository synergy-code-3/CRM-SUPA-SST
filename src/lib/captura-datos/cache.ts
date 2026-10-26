// Caché en memoria del navegador para Captura de Datos: al volver a una pantalla se muestra al instante lo último
// que se vio y se refresca por detrás (el polling ya lo hace). Vive solo mientras la pestaña esté abierta y va por
// persona, para que al cambiar de sesión no se vea nada de otra.
const memoria = new Map<string, unknown>();

const clave = (usuarioId: string | undefined, nombre: string) => `${usuarioId ?? "anon"}:${nombre}`;

export function leerCache<T>(usuarioId: string | undefined, nombre: string): T | null {
  return (memoria.get(clave(usuarioId, nombre)) as T | undefined) ?? null;
}

export function guardarCache<T>(usuarioId: string | undefined, nombre: string, valor: T): void {
  memoria.set(clave(usuarioId, nombre), valor);
}

export function olvidarCache(usuarioId: string | undefined, nombre: string): void {
  memoria.delete(clave(usuarioId, nombre));
}
