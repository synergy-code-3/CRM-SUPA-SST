"use client";

import { useEffect, useState } from "react";
import { Timer, Pause } from "lucide-react";

function partes(msRestante: number) {
  const total = Math.max(0, msRestante);
  const dias = Math.floor(total / (1000 * 60 * 60 * 24));
  const horas = Math.floor((total / (1000 * 60 * 60)) % 24);
  const minutos = Math.floor((total / (1000 * 60)) % 60);
  const segundos = Math.floor((total / 1000) % 60);
  return { dias, horas, minutos, segundos };
}

// Contador de "Tiempo restante de membresía" (días/hrs/min/seg + barra de
// progreso) — portado tal cual del CRM original. Sin la tarjeta exterior: el
// panel lateral lo envuelve en su propia sección.
export function CountdownTimer({
  fechaInicio,
  fechaVencimiento,
  pausada = false,
  fechaPausa = null,
}: {
  fechaInicio: string;
  fechaVencimiento: string;
  pausada?: boolean;
  fechaPausa?: string | null;
}) {
  const inicio = new Date(fechaInicio).getTime();
  const fin = new Date(fechaVencimiento).getTime();
  const [ahora, setAhora] = useState<number | null>(null);

  useEffect(() => {
    if (pausada) return;
    setAhora(Date.now());
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [pausada]);

  const referencia = pausada ? (fechaPausa ? new Date(fechaPausa).getTime() : Date.now()) : ahora;
  if (referencia === null) return null;

  const restante = fin - referencia;
  const { dias, horas, minutos, segundos } = partes(restante);
  const vencida = restante <= 0;
  const progreso = Math.min(100, Math.max(0, ((referencia - inicio) / (fin - inicio)) * 100));

  const unidades = [
    { valor: dias, label: "días" },
    { valor: horas, label: "hrs" },
    { valor: minutos, label: "min" },
    { valor: segundos, label: "seg" },
  ];

  return (
    <div>
      <div className="mb-5 flex items-center gap-2">
        {pausada ? (
          <Pause className="h-4 w-4 text-warning" strokeWidth={1.5} />
        ) : (
          <Timer className="h-4 w-4 text-primary" strokeWidth={1.5} />
        )}
        <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted">
          {pausada ? "Temporizador en pausa" : vencida ? "Membresía vencida" : "Tiempo restante de membresía"}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {unidades.map(({ valor, label }) => (
          <div
            key={label}
            className={`flex flex-col items-center rounded-2xl py-4 ${pausada ? "bg-warning/10" : "bg-primary-dim"}`}
          >
            <span
              className={`font-mono text-2xl font-semibold tabular-nums ${pausada ? "text-warning" : "text-primary-deep"}`}
            >
              {String(valor).padStart(2, "0")}
            </span>
            <span
              className={`mt-1 text-[10px] uppercase tracking-wider ${pausada ? "text-warning/70" : "text-primary-deep/60"}`}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <div className="h-2 w-full overflow-hidden rounded-full bg-silver">
          <div
            className={`h-full rounded-full transition-all duration-1000 ease-spring ${
              pausada ? "bg-warning" : "bg-gradient-to-r from-primary-glow to-primary"
            }`}
            style={{ width: `${progreso}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-muted">
          <span>{new Date(inicio).toLocaleDateString("es-MX")}</span>
          <span>{new Date(fin).toLocaleDateString("es-MX")}</span>
        </div>
      </div>
    </div>
  );
}
