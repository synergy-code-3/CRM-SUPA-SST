"use client";

import { ShieldCheck, Crown, Gem, Minus, Plus, AlertTriangle } from "lucide-react";
import type { Accesos, AccesoDetalle, Variante } from "@/lib/types";

const NIVELES: {
  key: keyof Accesos;
  label: string;
  icon: typeof ShieldCheck;
  activeClass: string;
  tieneVariante: boolean;
}[] = [
  {
    key: "general",
    label: "General",
    icon: ShieldCheck,
    activeClass: "general-plate text-white",
    tieneVariante: true,
  },
  {
    key: "vip",
    label: "VIP",
    icon: Crown,
    activeClass: "vip-plate text-white",
    tieneVariante: true,
  },
  {
    key: "black",
    label: "Black Access",
    icon: Gem,
    activeClass: "black-plate text-white",
    tieneVariante: false,
  },
];

function cantidadDe(lista: AccesoDetalle[], variante: Variante): number {
  return lista.find((d) => d.variante === variante)?.cantidad ?? 0;
}

// Reemplaza (o quita, si la cantidad queda en 0) la entrada de una variante
// específica dentro de la lista de una categoría, sin tocar la otra
// variante — así "General MX" y "General US" del mismo cliente se editan
// cada una por su lado.
function conCantidad(lista: AccesoDetalle[], variante: Variante, cantidad: number): AccesoDetalle[] {
  const limpia = Math.max(0, Math.floor(cantidad || 0));
  const resto = lista.filter((d) => d.variante !== variante);
  if (limpia <= 0) return resto;
  return [...resto, { activo: true, cantidad: limpia, variante }];
}

function ControlCantidad({
  label,
  cantidad,
  activo,
  onCambiar,
}: {
  label: string | null;
  cantidad: number;
  activo: boolean;
  onCambiar: (cantidad: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-1">
      {label && (
        <span className={`w-6 flex-none text-[10px] font-semibold ${activo ? "opacity-80" : "text-muted"}`}>
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={() => onCambiar(cantidad - 1)}
        disabled={cantidad <= 0}
        className={`ease-spring flex h-6 w-6 flex-none items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-40 ${
          activo ? "border-white/40 text-white hover:bg-white/10" : "border-silver text-muted hover:bg-surface"
        }`}
        aria-label={`Restar${label ? ` ${label}` : ""}`}
      >
        <Minus className="h-3 w-3" strokeWidth={2} />
      </button>
      <input
        type="number"
        min={0}
        value={cantidad}
        onChange={(e) => onCambiar(Number(e.target.value))}
        className={`w-10 flex-none rounded-md border bg-transparent py-0.5 text-center text-sm font-semibold outline-none ${
          activo ? "border-white/40 text-white" : "border-silver text-foreground"
        }`}
      />
      <button
        type="button"
        onClick={() => onCambiar(cantidad + 1)}
        className={`ease-spring flex h-6 w-6 flex-none items-center justify-center rounded-md border transition ${
          activo ? "border-white/40 text-white hover:bg-white/10" : "border-silver text-muted hover:bg-surface"
        }`}
        aria-label={`Sumar${label ? ` ${label}` : ""}`}
      >
        <Plus className="h-3 w-3" strokeWidth={2} />
      </button>
    </div>
  );
}

// Editor de cantidades de accesos (no on/off): cada variante se controla con
// un número exacto — llevarlo a 0 la quita, subirlo desde 0 la agrega. Así
// "quitarle 2 General MX y darle 2 VIP US" es simplemente escribir los
// números correspondientes, sin que una fila toque a la otra. General/VIP
// muestran una fila por variante (MX y US) porque un mismo cliente puede
// tener boletos en las dos a la vez (ver REGLAS-BOLETOS-SYNERGY.md sección
// 3); Black Access nunca tiene variante, así que es una sola fila.
export function AccesosSynergy({
  valor,
  onChange,
  soloLectura,
  sinInformacion,
}: {
  valor: Accesos;
  onChange: (nuevoValor: Accesos) => void;
  soloLectura?: boolean;
  // true cuando el motor de reglas no pudo calcular boletos (evento fuera
  // del inventario, o marcado "Editable" ahí — asignación a mano) — para no
  // confundir "no le toca nada" con "no sabemos qué le toca".
  sinInformacion?: boolean;
}) {
  function actualizar(nivel: keyof Accesos, variante: Variante, cantidad: number) {
    onChange({ ...valor, [nivel]: conCantidad(valor[nivel], variante, cantidad) });
  }

  return (
    <div>
      {sinInformacion && (
        <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5 flex-none" strokeWidth={1.75} />
          Sin información de boletos para este evento — no se calculó, no es que no le toque nada. Requiere
          asignación manual.
        </p>
      )}
      <div className="grid grid-cols-3 gap-3">
        {NIVELES.map(({ key, label, icon: Icon, activeClass, tieneVariante }) => {
          const detalle = valor[key];
          const activo = detalle.length > 0;
          return (
            <div
              key={key}
              className={`flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center transition ${
                activo ? `${activeClass} border-transparent diffused` : "border-silver bg-surface-2 text-muted"
              }`}
            >
              <Icon className="h-6 w-6" strokeWidth={1.75} />
              <span className="text-sm font-semibold">{label}</span>

              {soloLectura ? (
                <span className={`text-xs uppercase tracking-wide ${activo ? "opacity-80" : "opacity-60"}`}>
                  {activo
                    ? detalle.map((d) => `${d.cantidad}${d.variante ? ` · ${d.variante}` : ""}`).join(" + ")
                    : "Sin acceso"}
                </span>
              ) : tieneVariante ? (
                <div className="flex flex-col gap-1.5">
                  <ControlCantidad
                    label="MX"
                    cantidad={cantidadDe(detalle, "MX")}
                    activo={activo}
                    onCambiar={(c) => actualizar(key, "MX", c)}
                  />
                  <ControlCantidad
                    label="US"
                    cantidad={cantidadDe(detalle, "US")}
                    activo={activo}
                    onCambiar={(c) => actualizar(key, "US", c)}
                  />
                </div>
              ) : (
                <ControlCantidad
                  label={null}
                  cantidad={cantidadDe(detalle, null)}
                  activo={activo}
                  onCambiar={(c) => actualizar(key, null, c)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
