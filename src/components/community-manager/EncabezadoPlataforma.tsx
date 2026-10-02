import { Facebook, Instagram, Music2, GraduationCap, LayoutGrid } from "lucide-react";
import type { Plataforma } from "@/lib/community-manager";

const ICONO_PLATAFORMA: Record<Plataforma, typeof LayoutGrid> = {
  facebook: Facebook,
  instagram: Instagram,
  tiktok: Music2,
  skool: GraduationCap,
};

// Encabezado compartido de Estadísticas/Moderación: se queda fijo arriba
// al hacer scroll (sticky, no se mueve) y no deja ver nada "detrás" — el
// -mx/-mt lo estira hasta el borde de <main> (que trae su propio padding,
// ver src/app/(app)/layout.tsx) y bg-background + z-30 + border-b lo
// pintan sólido por encima de las tarjetas que pasan debajo al scrollear.
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
    <div className="sticky top-0 z-30 -mx-4 -mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-silver/70 bg-background px-4 pb-4 pt-5 sm:-mx-6 sm:px-6 md:-mx-8 md:-mt-8 md:px-8 md:pt-8">
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
