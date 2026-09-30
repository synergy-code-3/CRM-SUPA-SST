// Cache en memoria de MÓDULO (no sessionStorage/localStorage) para listas
// que se recargaban desde cero cada vez que se navegaba fuera de la página
// y se volvía — el useState de cada página vive y muere con el componente,
// pero una variable de módulo sobrevive a que React lo desmonte/remonte.
// Solo se pierde con un refresh completo del navegador — a propósito, es
// cache de la pestaña abierta, no persistencia real entre sesiones.
//
// Uso pensado: al montar, pintar de inmediato lo que haya en cache para la
// clave actual (sin "Cargando…") y, aparte, SIEMPRE seguir disparando el
// fetch real de todos modos — así un cambio hecho en otro dispositivo/
// pestaña se refleja poco después, en vez de quedarse pegado para siempre
// con el primer dato que se vio. Es "instantáneo primero, actualizado
// después", no un cache que sustituya el refresco.
export function crearCacheDeVista<T>() {
  const mapa = new Map<string, T>();
  return {
    obtener: (clave: string): T | undefined => mapa.get(clave),
    guardar: (clave: string, valor: T) => {
      mapa.set(clave, valor);
    },
    limpiar: () => {
      mapa.clear();
    },
  };
}
