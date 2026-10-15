"use client";

import { useEffect, useState } from "react";
import { X, ShieldX } from "lucide-react";

type ClienteVenceHoy = { id: string; nombre: string; email: string };

// Lista de clientes cuya membresía anual del Club (no Skool) vence hoy
// exactamente — ver listarClientesQueVencenHoy() en db.ts. Admin elige a
// quiénes revocarles el acceso de una sola vez (no los borra, solo revoca:
// acceso_plataforma = "Revocado" + intenta quitar la oferta en Kajabi).
export function VencenHoyModal({ onClose, onRevocado }: { onClose: () => void; onRevocado: () => void }) {
  const [clientes, setClientes] = useState<ClienteVenceHoy[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [revocando, setRevocando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clientes/vencen-hoy")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "No se pudo cargar la lista");
        setClientes(data.clientes);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar la lista"));
  }, []);

  const todosSeleccionados = !!clientes?.length && seleccionados.size === clientes.length;

  function alternarTodos() {
    setSeleccionados(todosSeleccionados ? new Set() : new Set(clientes?.map((c) => c.id)));
  }

  function alternarUno(id: string) {
    setSeleccionados((s) => {
      const nuevo = new Set(s);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  async function revocarSeleccionados() {
    if (seleccionados.size === 0) return;
    if (!window.confirm(`¿Revocar el acceso de ${seleccionados.size} cliente(s)? No se eliminan, solo se les quita el acceso (Kajabi + plataforma).`)) return;
    setRevocando(true);
    setResultado(null);
    setError(null);
    try {
      const res = await fetch("/api/clientes/revocar-acceso-masivo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...seleccionados] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo revocar el acceso");
      const resultados: { id: string; ok: boolean; avisoKajabi: string | null }[] = data.resultados;
      const fallos = resultados.filter((r) => !r.ok).length;
      const avisosKajabi = resultados.filter((r) => r.avisoKajabi).length;
      setResultado(
        `${resultados.length - fallos} revocado(s).${fallos ? ` ${fallos} fallaron.` : ""}${avisosKajabi ? ` ${avisosKajabi} sin poder confirmar en Kajabi (igual quedaron revocados aquí).` : ""}`
      );
      setClientes((cs) => (cs ?? []).filter((c) => !resultados.some((r) => r.id === c.id && r.ok)));
      setSeleccionados(new Set());
      onRevocado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar el acceso");
    } finally {
      setRevocando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/30 p-6 backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="shell w-full max-w-lg rounded-[2rem] p-2 diffused-lg animate-fade-in">
        <div className="core flex max-h-[80vh] flex-col rounded-[calc(2rem-0.5rem)] p-6">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Vence hoy</h2>
            <button onClick={onClose} className="ease-spring rounded-full p-1.5 text-muted transition hover:bg-surface-2">
              <X className="h-4.5 w-4.5" strokeWidth={1.75} />
            </button>
          </div>
          <p className="mb-4 text-sm text-muted">
            Membresía anual del Club (fecha de inscripción o renovación + 1 año) — no es el vencimiento de Skool.
          </p>

          {error && <p className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}
          {resultado && <p className="mb-3 rounded-xl border border-success/30 bg-success/10 px-4 py-2.5 text-sm text-success">{resultado}</p>}

          {clientes === null ? (
            <p className="py-8 text-center text-sm text-muted">Calculando…</p>
          ) : clientes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Nadie vence hoy.</p>
          ) : (
            <>
              <label className="flex items-center gap-2 border-b border-silver/60 px-1 pb-2 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={todosSeleccionados}
                  onChange={alternarTodos}
                  className="h-4 w-4 rounded border-silver-deep/60 accent-primary"
                />
                Seleccionar todos ({clientes.length})
              </label>
              <ul className="flex-1 divide-y divide-silver/60 overflow-y-auto">
                {clientes.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-center gap-2.5 px-1 py-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={seleccionados.has(c.id)}
                        onChange={() => alternarUno(c.id)}
                        className="h-4 w-4 flex-none rounded border-silver-deep/60 accent-primary"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">{c.nombre}</span>
                        <span className="block truncate text-xs text-muted">{c.email}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>

              <button
                onClick={revocarSeleccionados}
                disabled={seleccionados.size === 0 || revocando}
                className="ease-spring mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-danger px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-40"
              >
                <ShieldX className="h-4 w-4" strokeWidth={1.75} />
                {revocando ? "Revocando…" : `Revocar acceso (${seleccionados.size})`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
