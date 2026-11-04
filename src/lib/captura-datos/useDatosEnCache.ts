"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { guardarCache, leerCache, olvidarCache } from "./cache";

/**
 * Pide los datos una sola vez por `clave` mientras la pestaña esté abierta: al volver a abrir la pantalla se muestran
 * los ya guardados sin pedir de nuevo. `recargar` descarta lo guardado y los pide otra vez.
 */
export function useDatosEnCache<T>(usuarioId: string | undefined, clave: string, pedir: () => Promise<T>) {
  const [datos, setDatos] = useState<T | null>(() => leerCache<T>(usuarioId, clave));
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const pedirActual = useRef(pedir);
  pedirActual.current = pedir;

  useEffect(() => {
    setError(null);
    const guardado = leerCache<T>(usuarioId, clave);
    if (guardado) {
      setDatos(guardado);
      return;
    }
    setDatos(null);
    let vigente = true;
    pedirActual.current()
      .then((r) => {
        if (!vigente) return;
        guardarCache(usuarioId, clave, r);
        setDatos(r);
      })
      .catch((e) => vigente && setError(e instanceof Error ? e.message : "No se pudo cargar."));
    return () => { vigente = false; };
  }, [usuarioId, clave, version]);

  const recargar = useCallback(() => {
    olvidarCache(usuarioId, clave);
    setVersion((v) => v + 1);
  }, [usuarioId, clave]);

  return { datos, error, recargar };
}
