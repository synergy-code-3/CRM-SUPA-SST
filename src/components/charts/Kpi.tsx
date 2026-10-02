import type { LucideIcon } from "lucide-react";

const TONE_ICONO: Record<string, string> = {
  primary: "bg-primary-dim text-primary",
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
  teal: "bg-teal-500/15 text-teal-600",
  warning: "bg-warning/15 text-amber-600",
  purple: "bg-violet-500/15 text-violet-600",
};

const TONE_SUB: Record<string, string> = {
  primary: "bg-primary-dim text-primary-deep",
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
  teal: "bg-teal-500/15 text-teal-700",
  warning: "bg-warning/15 text-amber-700",
  purple: "bg-violet-500/15 text-violet-700",
};

export type ToneKpi = "primary" | "success" | "danger" | "teal" | "warning" | "purple";

export function Kpi({
  icon: Icon,
  label,
  sub,
  value,
  tone,
  grande = false,
}: {
  icon: LucideIcon;
  label: string;
  sub: string;
  value: number | undefined;
  tone: ToneKpi;
  // Variante más grande (Community Manager) sin tocar el tamaño por
  // defecto que ya usa el Dashboard del Club.
  grande?: boolean;
}) {
  // La variante "grande" (Community Manager) va en fila — ícono al lado del
  // número, no arriba — para que la tarjeta quede más delgada. La variante
  // por defecto (Dashboard del Club) se queda apilada, igual que siempre.
  if (grande) {
    return (
      <div className="shell rounded-[1.25rem] p-1.5 diffused">
        <div className="core flex items-center gap-3.5 rounded-[calc(1.25rem-0.375rem)] p-4">
          <div className={`flex h-11 w-11 flex-none items-center justify-center rounded-lg ${TONE_ICONO[tone]}`}>
            <Icon className="h-5.5 w-5.5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <p className="text-2xl font-semibold leading-none text-foreground">
                {value !== undefined ? value.toLocaleString("es-MX") : "—"}
              </p>
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TONE_SUB[tone]}`}>{sub}</span>
            </div>
            <p className="truncate text-sm text-muted">{label}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shell rounded-[1.25rem] p-1.5 diffused">
      <div className="core rounded-[calc(1.25rem-0.375rem)] p-3.5">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${TONE_ICONO[tone]}`}>
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </div>
        <p className="mt-3 text-xl font-semibold text-foreground">
          {value !== undefined ? value.toLocaleString("es-MX") : "—"}
        </p>
        <p className="text-[11px] text-muted">{label}</p>
        <span className={`mt-2 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-medium ${TONE_SUB[tone]}`}>
          {sub}
        </span>
      </div>
    </div>
  );
}
