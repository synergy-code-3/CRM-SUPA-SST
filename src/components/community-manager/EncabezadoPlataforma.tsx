import { Facebook, Instagram, Music2, GraduationCap, LayoutGrid } from "lucide-react";
import type { Plataforma } from "@/lib/community-manager";

const ICONO_PLATAFORMA: Record<Plataforma, typeof LayoutGrid> = {
  facebook: Facebook,
  instagram: Instagram,
  tiktok: Music2,
  skool: GraduationCap,
};

// Encabezado compartido de Estadísticas/Moderación: se queda fijo arriba
// al hacer scroll (sticky, no se mueve) sin dejar ver nada "detrás" — bg
// sólido + z alto bastan. (Antes se intentó estirarlo con márgenes
// negativos hasta el borde de <main>, pero eso descolocaba el sticky —
// quedaba "pegado" de más, tapando mal el contenido. Así, simple, es lo
// que de verdad funciona.)
export function EncabezadoPlataforma({
  plataforma,
  titulo,
  subtitulo,
  extra,
}: {
  plataforma: Plataforma | null;
  titulo: React.ReactNode;
  subtitulo: string;
  extra?: React.ReactNode;
}) {
  const Icono = plataforma ? ICONO_PLATAFORMA[plataforma] : LayoutGrid;
  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-silver/70 bg-background pb-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-primary-dim text-primary-deep">
          <Icono className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{titulo}</h1>
          <p className="text-sm text-muted">{subtitulo}</p>
        </div>
      </div>
      {extra}
    </div>
  );
}
