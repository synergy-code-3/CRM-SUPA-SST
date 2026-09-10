"use client";

import Image from "next/image";
import { X } from "lucide-react";

// Overlay de pantalla completa para ver una foto de perfil en grande —
// compartido entre Usuarios (perfil de cualquier usuario) y "Mi perfil"
// (la propia). Se cierra tocando fuera de la imagen, la X, o Esc.
export function FotoAmpliada({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  return (
    <div
      className="animate-fade-in-fast fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="ease-spring absolute right-4 top-4 rounded-full bg-black/40 p-2 text-white transition hover:bg-black/60"
      >
        <X className="h-5 w-5" strokeWidth={2} />
      </button>
      <Image
        src={url}
        alt={alt}
        width={800}
        height={800}
        unoptimized
        className="max-h-[85vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
