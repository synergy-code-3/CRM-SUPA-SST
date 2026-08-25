"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Tema = "light" | "dark" | "system";

const CLAVE_STORAGE = "crm-tema";

type TemaContextValue = {
  tema: Tema;
  setTema: (t: Tema) => void;
};

const TemaContext = createContext<TemaContextValue | null>(null);

function aplicarTema(tema: Tema) {
  const raiz = document.documentElement;
  if (tema === "system") raiz.removeAttribute("data-theme");
  else raiz.setAttribute("data-theme", tema);
}

// El <html> ya trae data-theme correcto desde el script inline en
// layout.tsx (evita el parpadeo al cargar) — este provider solo retoma
// ese valor guardado para que el resto de la app (ej. MiPerfilModal) lo
// pueda leer/cambiar.
export function TemaProvider({ children }: { children: React.ReactNode }) {
  const [tema, setTemaState] = useState<Tema>("system");

  useEffect(() => {
    const guardado = localStorage.getItem(CLAVE_STORAGE) as Tema | null;
    if (guardado === "light" || guardado === "dark" || guardado === "system") setTemaState(guardado);
  }, []);

  const setTema = useCallback((t: Tema) => {
    setTemaState(t);
    localStorage.setItem(CLAVE_STORAGE, t);
    aplicarTema(t);
  }, []);

  return <TemaContext.Provider value={{ tema, setTema }}>{children}</TemaContext.Provider>;
}

export function useTema() {
  const ctx = useContext(TemaContext);
  if (!ctx) throw new Error("useTema debe usarse dentro de TemaProvider");
  return ctx;
}
