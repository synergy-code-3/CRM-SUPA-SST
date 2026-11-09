import { useCallback, useEffect, useRef, useState } from "react";

const AVISO_MS = 2500;

/** Aviso corto junto a un campo cuando lo escrito o pegado se filtró o recortó; se quita solo. */
export function useAvisoLimite() {
  const [avisos, setAvisos] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const activos = timers.current;
    return () => Object.values(activos).forEach(clearTimeout);
  }, []);

  const avisar = useCallback((clave: string, mensaje: string | null) => {
    clearTimeout(timers.current[clave]);
    setAvisos((a) => {
      if (mensaje !== null) return { ...a, [clave]: mensaje };
      if (!(clave in a)) return a;
      const resto = { ...a };
      delete resto[clave];
      return resto;
    });
    if (mensaje !== null) timers.current[clave] = setTimeout(() => avisar(clave, null), AVISO_MS);
  }, []);

  return { avisos, avisar };
}

/** Aviso si el valor limpio difiere de lo esperado (lo escrito sin las normalizaciones silenciosas): exceso de largo o caracteres no permitidos. */
export function mensajeLimite(esperado: string, limpio: string, max: number, soloEtiqueta: string, unidad = "caracteres"): string | null {
  if (esperado === limpio) return null;
  return esperado.length > max && limpio.length >= max ? `Máximo ${max} ${unidad}` : soloEtiqueta;
}
