"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

// Certificación que se está viendo en el workspace de Certificaciones: null =
// todas (todos los clientes y los totales); un id = solo esa certificación.
// Se recuerda entre visitas. Vive en CertificacionesShell.
const STORAGE_KEY = "certificacionActualId";

type Valor = {
  certificacionActual: string | null;
  setCertificacionActual: (id: string | null) => void;
};

const Contexto = createContext<Valor | null>(null);

export function CertificacionActualProvider({ children }: { children: React.ReactNode }) {
  const [actual, setActual] = useState<string | null>(null);

  useEffect(() => {
    try {
      setActual(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      // sin almacenamiento: se queda en "todas"
    }
  }, []);

  const setCertificacionActual = useCallback((id: string | null) => {
    setActual(id);
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignorar
    }
  }, []);

  return <Contexto.Provider value={{ certificacionActual: actual, setCertificacionActual }}>{children}</Contexto.Provider>;
}

// Fuera del workspace de Certificaciones (p. ej. el Sidebar del Club) no hay
// contexto: devuelve null en vez de lanzar error.
export function useCertificacionActualOpcional(): Valor | null {
  return useContext(Contexto);
}

export function useCertificacionActual(): Valor {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useCertificacionActual debe usarse dentro de CertificacionActualProvider");
  return ctx;
}
