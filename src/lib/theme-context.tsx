"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { flushSync } from "react-dom";

export type Tema = "light" | "dark" | "aura" | "system";

const CLAVE_STORAGE = "crm-tema";

type Punto = { x: number; y: number };

type TemaContextValue = {
  tema: Tema;
  setTema: (t: Tema, origen?: Punto) => void;
};

const TemaContext = createContext<TemaContextValue | null>(null);

function aplicarTema(tema: Tema) {
  const raiz = document.documentElement;
  if (tema === "system") raiz.removeAttribute("data-theme");
  else raiz.setAttribute("data-theme", tema);
}

type DocumentoConTransicion = Document & {
  startViewTransition?: (cambio: () => void) => { ready: Promise<void> };
};

// El <html> ya trae data-theme correcto desde el script inline en
// layout.tsx (evita el parpadeo al cargar) — este provider solo retoma
// ese valor guardado para que el resto de la app (ej. MiPerfilModal) lo
// pueda leer/cambiar.
export function TemaProvider({ children }: { children: React.ReactNode }) {
  const [tema, setTemaState] = useState<Tema>("system");

  useEffect(() => {
    const guardado = localStorage.getItem(CLAVE_STORAGE) as Tema | null;
    if (guardado === "light" || guardado === "dark" || guardado === "aura" || guardado === "system") setTemaState(guardado);
  }, []);

  // Con `origen`, el tema nuevo se revela como un círculo que crece desde
  // ese punto (View Transitions: el navegador congela una captura del tema
  // viejo y recorta encima la del nuevo). Sin soporte del navegador, el
  // cambio es instantáneo como antes; con "reducir movimiento" activado en
  // el sistema queda solo el fundido corto que el navegador trae por
  // defecto (ver ::view-transition en globals.css).
  const setTema = useCallback((t: Tema, origen?: Punto) => {
    localStorage.setItem(CLAVE_STORAGE, t);
    const cambiar = () => {
      flushSync(() => setTemaState(t));
      aplicarTema(t);
    };

    const doc = document as DocumentoConTransicion;
    if (!doc.startViewTransition || !origen) {
      cambiar();
      return;
    }

    const reducirMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const transicion = doc.startViewTransition(cambiar);
    if (reducirMovimiento) return;

    const { x, y } = origen;
    const radio = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    transicion.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radio}px at ${x}px ${y}px)`] },
          { duration: 600, easing: "cubic-bezier(0.32, 0.72, 0, 1)", pseudoElement: "::view-transition-new(root)" }
        );
      })
      .catch(() => {});
  }, []);

  return <TemaContext.Provider value={{ tema, setTema }}>{children}</TemaContext.Provider>;
}

export function useTema() {
  const ctx = useContext(TemaContext);
  if (!ctx) throw new Error("useTema debe usarse dentro de TemaProvider");
  return ctx;
}
