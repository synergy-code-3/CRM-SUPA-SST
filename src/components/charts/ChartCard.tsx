import type { LucideIcon } from "lucide-react";

export function ChartCard({
  icon: Icon,
  iconTone = "text-primary",
  title,
  subtitle,
  className = "",
  children,
}: {
  icon?: LucideIcon;
  iconTone?: string;
  title: string;
  subtitle: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`shell rounded-[2rem] p-2 diffused-lg ${className}`}>
      <div className="core rounded-[calc(2rem-0.5rem)] p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {Icon && <Icon className={`h-4 w-4 ${iconTone}`} strokeWidth={1.75} />}
          {title}
        </h3>
        <p className="mb-4 text-xs text-muted">{subtitle}</p>
        <div className="h-64">{children}</div>
      </div>
    </div>
  );
}
