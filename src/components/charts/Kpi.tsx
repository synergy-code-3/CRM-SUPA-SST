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
  return (
    <div className="shell rounded-[1.25rem] p-1.5 diffused">
      <div className={`core rounded-[calc(1.25rem-0.375rem)] ${grande ? "p-5" : "p-3.5"}`}>
        <div
          className={`flex items-center justify-center rounded-lg ${TONE_ICONO[tone]} ${
            grande ? "h-11 w-11" : "h-8 w-8"
          }`}
        >
          <Icon className={grande ? "h-5.5 w-5.5" : "h-4 w-4"} strokeWidth={1.75} />
        </div>
        <p className={`mt-3 font-semibold text-foreground ${grande ? "text-3xl" : "text-xl"}`}>
          {value !== undefined ? value.toLocaleString("es-MX") : "—"}
        </p>
        <p className={grande ? "text-sm text-muted" : "text-[11px] text-muted"}>{label}</p>
        <span
          className={`mt-2 inline-block rounded-full font-medium ${TONE_SUB[tone]} ${
            grande ? "px-2 py-1 text-xs" : "px-1.5 py-0.5 text-[9px]"
          }`}
        >
          {sub}
        </span>
      </div>
    </div>
  );
}
