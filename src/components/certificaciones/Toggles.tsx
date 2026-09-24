"use client";

import { useState } from "react";
import { AlertTriangle, Check, CheckCircle2, LoaderCircle, Send, X } from "lucide-react";
import type { MensajeBienvenidaCertificacion } from "@/lib/certificaciones-tipos";
import { BIENVENIDA_LABEL, ESTADOS_BIENVENIDA } from "./constantes";

export function ResultadoPopup({
  titulo,
  mensaje,
  tipo = "success",
  onClose,
}: {
  titulo: string;
  mensaje: string;
  tipo?: "success" | "error";
  onClose: () => void;
}) {
  const Icon = tipo === "error" ? AlertTriangle : CheckCircle2;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-fade-in-fast bg-black/40" onClick={onClose} />
      <div className="animate-fade-in relative flex w-full max-w-sm flex-col gap-3 rounded-[2rem] bg-surface p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] ${
              tipo === "error" ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
            }`}
          >
            <Icon className="h-3 w-3" strokeWidth={2} />
            {titulo}
          </span>
          <button
            onClick={onClose}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-xl text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        <p className="whitespace-pre-wrap text-sm text-foreground">{mensaje}</p>
        <button
          onClick={onClose}
          className="mt-1 self-end rounded-full bg-primary px-5 py-2 text-sm font-medium text-white transition-all duration-500 ease-spring active:scale-[0.98]"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}

async function post(clienteId: string, ruta: string, body?: unknown) {
  const res = await fetch(`/api/certificaciones/${encodeURIComponent(clienteId)}/${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

// Botón de invitación de la lista (rojo = sin enviar, verde = enviada). Solo
// deshace si todavía no fue aceptada. Enviar dispara también el aviso a
// Skool (ruta .../invitar) y avisa si falló.
export function InvitacionToggle({
  clienteId,
  clienteNombre,
  enviada,
  puedeDeshacer = true,
  compacto = false,
  onCambio,
}: {
  clienteId: string;
  clienteNombre: string;
  enviada: boolean;
  puedeDeshacer?: boolean;
  compacto?: boolean;
  onCambio: () => void;
}) {
  const [cargando, setCargando] = useState(false);
  const [popup, setPopup] = useState<{ titulo: string; mensaje: string; tipo: "success" | "error" } | null>(null);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (cargando || (enviada && !puedeDeshacer)) return;
    setCargando(true);
    try {
      if (enviada) {
        const r = await post(clienteId, "deshacer", { que: "invitacion" });
        if (!r.ok) setPopup({ titulo: "No se pudo deshacer", mensaje: r.data.error ?? "Error desconocido", tipo: "error" });
      } else {
        const r = await post(clienteId, "invitar");
        if (!r.ok) {
          setPopup({ titulo: "No se pudo enviar", mensaje: r.data.error ?? "Error desconocido", tipo: "error" });
        } else if (r.data.avisoSkool) {
          setPopup({
            titulo: "Falló el envío a Skool",
            mensaje: `"${clienteNombre}" quedó marcado como "Invitación enviada" en el CRM, pero el aviso real a Skool falló:\n\n${r.data.avisoSkool}\n\nEntra a su perfil y usa "Reenviar invitación a Skool" para reintentar.`,
            tipo: "error",
          });
        } else {
          setPopup({
            titulo: "Invitación enviada",
            mensaje: `"${clienteNombre}" quedó marcado en el CRM y el aviso real a Skool se envió correctamente.`,
            tipo: "success",
          });
        }
      }
      onCambio();
    } finally {
      setCargando(false);
    }
  }

  const tamano = compacto ? "h-6 w-6" : "h-7 w-7";

  return (
    <>
      <button
        onClick={toggle}
        disabled={cargando || (enviada && !puedeDeshacer)}
        title={enviada && !puedeDeshacer ? "Invitación ya aceptada" : "Invitación enviada"}
        className={`flex ${tamano} flex-none items-center justify-center rounded-lg transition-all duration-500 ease-spring active:scale-90 disabled:cursor-not-allowed ${
          enviada && !puedeDeshacer ? "opacity-70" : ""
        } ${enviada ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}
      >
        {cargando ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
        ) : enviada ? (
          <Send className="h-3.5 w-3.5" strokeWidth={2.5} />
        ) : (
          <div className="h-2 w-2 rounded-full bg-danger" />
        )}
      </button>
      {popup && <ResultadoPopup titulo={popup.titulo} mensaje={popup.mensaje} tipo={popup.tipo} onClose={() => setPopup(null)} />}
    </>
  );
}

// Estado del "Mensaje de bienvenida" (WhatsApp de soporte). Compacto en la
// lista (alterna Enviada/Pendiente), segmentado de 3 opciones en el perfil.
export function MensajeBienvenidaToggle({
  clienteId,
  estado,
  compacto = false,
  onCambio,
}: {
  clienteId: string;
  estado: MensajeBienvenidaCertificacion;
  compacto?: boolean;
  onCambio: () => void;
}) {
  const [cargando, setCargando] = useState(false);

  async function cambiar(nuevo: MensajeBienvenidaCertificacion) {
    if (cargando || nuevo === estado) return;
    setCargando(true);
    try {
      const r = await post(clienteId, "bienvenida", { estado: nuevo });
      if (!r.ok) alert(r.data.error ?? "No se pudo cambiar el estado");
      onCambio();
    } finally {
      setCargando(false);
    }
  }

  if (!compacto) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-surface-2 p-1">
        {ESTADOS_BIENVENIDA.map((valor) => (
          <button
            key={valor}
            onClick={() => cambiar(valor)}
            disabled={cargando}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-500 ease-spring disabled:opacity-50 ${
              estado === valor
                ? valor === "INVALIDO"
                  ? "bg-danger/15 text-danger"
                  : valor === "ENVIADA"
                    ? "bg-success/15 text-success"
                    : "bg-warning/15 text-warning"
                : "text-muted hover:text-foreground"
            }`}
          >
            {BIENVENIDA_LABEL[valor]}
          </button>
        ))}
      </div>
    );
  }

  const esInvalido = estado === "INVALIDO";
  const esEnviada = estado === "ENVIADA";

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        cambiar(esEnviada ? "PENDIENTE" : "ENVIADA");
      }}
      disabled={cargando}
      title={BIENVENIDA_LABEL[estado]}
      className={`flex h-6 w-6 flex-none items-center justify-center rounded-lg transition-all duration-500 ease-spring active:scale-90 ${
        esInvalido ? "bg-danger/15 text-danger" : esEnviada ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
      }`}
    >
      {cargando ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
      ) : esInvalido ? (
        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
      ) : esEnviada ? (
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
      ) : (
        <div className="h-2 w-2 rounded-full bg-warning" />
      )}
    </button>
  );
}
