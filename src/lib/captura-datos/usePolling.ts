"use client";

import { useEffect, useRef } from "react";

/**
 * Ejecuta `tarea` al montar y luego cada `intervaloMs`, pero solo mientras la pestaña está visible:
 * al ocultarse se detiene y al volver se refresca de inmediato. Con `activo=false` no hace nada.
 */
export function usePolling(tarea: () => void, intervaloMs: number, activo = true): void {
  const tareaRef = useRef(tarea);
  useEffect(() => {
    tareaRef.current = tarea;
  }, [tarea]);

  useEffect(() => {
    if (!activo) return;
    let temporizador: ReturnType<typeof setInterval> | null = null;

    const detener = () => {
      if (temporizador) clearInterval(temporizador);
      temporizador = null;
    };
    const iniciar = () => {
      detener();
      tareaRef.current();
      temporizador = setInterval(() => tareaRef.current(), intervaloMs);
    };
    const alCambiarVisibilidad = () => (document.visibilityState === "visible" ? iniciar() : detener());

    if (document.visibilityState === "visible") iniciar();
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    return () => {
      detener();
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    };
  }, [intervaloMs, activo]);
}
