"use client";

import { createContext, useCallback, useContext, useState } from "react";

// Permite que una página con filtros (ej. Clientes) le avise al Sidebar que
// existe un panel de "Filtros" para esta pantalla — en celular, el Sidebar
// muestra un ítem "Filtros" en su menú (sección "ESTA PÁGINA") en vez de
// que cada página dibuje su propio botón/acordeón. La página se registra al
// montarse y se quita al desmontarse (o al navegar a una página sin
// filtros), así el ítem solo aparece donde aplica.
type FiltrosMovilConfig = {
  activo: boolean;
  contador: number;
  onAbrir: () => void;
};

type FiltrosMovilContextValue = {
  config: FiltrosMovilConfig | null;
  registrar: (config: FiltrosMovilConfig | null) => void;
};

const FiltrosMovilContext = createContext<FiltrosMovilContextValue | null>(null);

export function FiltrosMovilProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<FiltrosMovilConfig | null>(null);
  const registrar = useCallback((c: FiltrosMovilConfig | null) => setConfig(c), []);
  return (
    <FiltrosMovilContext.Provider value={{ config, registrar }}>{children}</FiltrosMovilContext.Provider>
  );
}

export function useFiltrosMovil() {
  const ctx = useContext(FiltrosMovilContext);
  if (!ctx) throw new Error("useFiltrosMovil debe usarse dentro de FiltrosMovilProvider");
  return ctx;
}
