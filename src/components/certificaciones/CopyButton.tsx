"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyButton({ valor }: { valor: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // portapapeles no disponible, ignorar
    }
  }

  return (
    <button
      onClick={copiar}
      title="Copiar"
      className={`flex h-5 w-5 flex-none items-center justify-center rounded-md transition-all duration-500 ease-spring active:scale-90 ${
        copiado ? "text-success" : "text-muted hover:text-primary"
      }`}
    >
      {copiado ? <Check className="h-3 w-3" strokeWidth={2.5} /> : <Copy className="h-3 w-3" strokeWidth={2} />}
    </button>
  );
}
