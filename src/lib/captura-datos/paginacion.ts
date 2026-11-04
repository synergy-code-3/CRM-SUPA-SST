/** Una página (0-based) de `items`. Si la página pedida se pasa del final (los datos se acortaron), devuelve la última. */
export function paginar<T>(items: readonly T[], pagina: number, tamano: number): { items: T[]; pagina: number; paginas: number } {
  const paginas = Math.max(1, Math.ceil(items.length / tamano));
  const actual = Math.min(Math.max(pagina, 0), paginas - 1);
  return { items: items.slice(actual * tamano, (actual + 1) * tamano), pagina: actual, paginas };
}
