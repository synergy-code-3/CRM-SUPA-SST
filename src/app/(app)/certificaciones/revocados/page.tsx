"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Ban, LoaderCircle, RotateCcw, ShieldAlert } from "lucide-react";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";
import type { ClienteCertificacion } from "@/lib/certificaciones-tipos";

function formatearFecha(fecha: string | null): string {
  if (!fecha) return "—";
  return new Date(fecha).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

export default function RevocadosCertificacionesPage() {
  const { usuario, cargando } = useSesion();
  const puedeGestionar = !!usuario && tienePermiso(usuario.rol, "gestionarCertificaciones");
  const [clientes, setClientes] = useState<ClienteCertificacion[] | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/certificaciones/revocados");
    if (!res.ok) return;
    const data = await res.json();
    setClientes(data.clientes);
  }, []);

  useEffect(() => {
    if (puedeGestionar) cargar();
  }, [puedeGestionar, cargar]);

  async function reactivar(c: ClienteCertificacion) {
    if (!window.confirm(`¿Quitar a "${c.nombre}" de Revocados y devolverlo a la lista normal de clientes?`)) return;
    setProcesando(c.id);
    try {
      const res = await fetch(`/api/certificaciones/${encodeURIComponent(c.id)}/reactivar`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "No se pudo reactivar");
        return;
      }
      await cargar();
    } finally {
      setProcesando(null);
    }
  }

  if (cargando) return <div className="py-16 text-center text-sm text-muted">Cargando…</div>;

  if (!puedeGestionar) {
    return (
      <div className="shell rounded-[2rem] p-2 diffused-lg">
        <div className="core flex flex-col items-center gap-3 rounded-[calc(2rem-0.5rem)] p-16 text-center">
          <ShieldAlert className="h-6 w-6 text-muted" strokeWidth={1.5} />
          <p className="text-sm text-muted">No tienes permiso para ver esta sección.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="inline-block w-fit rounded-full bg-danger/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-danger">
          Revocados
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Accesos revocados</h1>
        <p className="text-sm text-muted">
          Clientes a los que se les revocó el acceso (reembolsos u otros casos) — no aparecen en la lista normal.
          Recuerda quitarles el acceso en Skool a mano, esto no lo hace solo.
        </p>
      </div>

      <div className="shell rounded-[2rem] p-2 diffused-lg">
        <div className="core rounded-[calc(2rem-0.5rem)] p-2 md:p-3">
          {clientes === null ? (
            <p className="px-6 py-16 text-center text-sm text-muted">Cargando…</p>
          ) : clientes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <Ban className="h-6 w-6 text-muted" strokeWidth={1.5} />
              <p className="text-sm text-muted">No hay clientes revocados.</p>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-silver">
              {clientes.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{c.nombre}</p>
                    <p className="truncate text-xs text-muted">{c.email || "Sin correo"}</p>
                    <p className="text-xs text-muted">
                      Revocado el {formatearFecha(c.fechaRevocacion)}
                      {c.motivoRevocacion ? ` — ${c.motivoRevocacion}` : ""}
                    </p>
                  </div>
                  <div className="flex max-w-full flex-wrap items-center gap-2">
                    <button
                      onClick={() => reactivar(c)}
                      disabled={procesando === c.id}
                      className="flex items-center gap-1.5 rounded-full bg-success/10 px-4 py-2 text-xs font-medium text-success transition-all duration-500 ease-spring hover:bg-success/20 active:scale-[0.98] disabled:opacity-50"
                    >
                      {procesando === c.id ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                      )}
                      Quitar de Revocados
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Link href="/certificaciones" className="text-xs font-medium text-muted hover:text-primary">
        ← Volver a clientes
      </Link>
    </div>
  );
}
