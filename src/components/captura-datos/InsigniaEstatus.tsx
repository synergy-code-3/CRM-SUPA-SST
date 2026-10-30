import { CheckCircle2, Clock, UserRound } from "lucide-react";
import type { Estatus } from "@/lib/captura-datos/fields";

export const ESTILO_ESTATUS: Record<Estatus, { insignia: string; seccion: string; icono: typeof CheckCircle2 }> = {
  Completo: { insignia: "border-success/40 bg-success/15 text-success", seccion: "border-success/30 bg-success/5", icono: CheckCircle2 },
  Apartado: { insignia: "border-sky-500/40 bg-sky-500/15 text-sky-700", seccion: "border-sky-500/30 bg-sky-500/5", icono: Clock },
  Interesado: { insignia: "border-violet-500/40 bg-violet-500/15 text-violet-700", seccion: "border-violet-500/30 bg-violet-500/5", icono: UserRound },
};

export function InsigniaEstatus({ estatus, texto }: { estatus: Estatus; texto?: string }) {
  const { insignia, icono: Icono } = ESTILO_ESTATUS[estatus];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${insignia}`}>
      <Icono className="h-3.5 w-3.5" /> {texto ?? estatus}
    </span>
  );
}
