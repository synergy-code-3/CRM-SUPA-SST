import { Circle, Send, CheckCircle2, XCircle } from "lucide-react";
import type { EstadoCertificacion } from "@/lib/certificaciones-tipos";
import { ESTADO_LABEL } from "./constantes";

const STYLES: Record<EstadoCertificacion, string> = {
  NUEVO: "bg-silver text-muted",
  INVITACION_ENVIADA: "bg-warning/10 text-warning",
  ACTIVO: "bg-success/10 text-success",
  VENCIDO: "bg-danger/10 text-danger",
};

const ICONS: Record<EstadoCertificacion, typeof Circle> = {
  NUEVO: Circle,
  INVITACION_ENVIADA: Send,
  ACTIVO: CheckCircle2,
  VENCIDO: XCircle,
};

export function StatusBadge({
  estado,
  onClick,
  cargando = false,
  title,
}: {
  estado: EstadoCertificacion;
  onClick?: (e: React.MouseEvent) => void;
  cargando?: boolean;
  title?: string;
}) {
  const Icon = ICONS[estado];
  const clases = `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium ${STYLES[estado]}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!cargando) onClick(e);
        }}
        disabled={cargando}
        title={title}
        className={`${clases} transition-transform duration-500 ease-spring active:scale-95 disabled:cursor-not-allowed disabled:opacity-70`}
      >
        <Icon className="h-3 w-3" strokeWidth={2} />
        {ESTADO_LABEL[estado]}
      </button>
    );
  }

  return (
    <span className={clases}>
      <Icon className="h-3 w-3" strokeWidth={2} />
      {ESTADO_LABEL[estado]}
    </span>
  );
}
