"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, ShieldX, ExternalLink, UserRound } from "lucide-react";
import type { Cliente } from "@/lib/types";

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
  const [verPerfilId, setVerPerfilId] = useState<string | null>(null);

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
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 overflow-y-auto bg-foreground/30 p-6 backdrop-blur-[2px] md:flex-row"
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
                  <li key={c.id} className="flex items-center gap-2.5 px-1 py-2.5 text-sm">
                    <label className="flex min-w-0 flex-1 items-center gap-2.5">
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
                    <button
                      onClick={() => setVerPerfilId(c.id)}
                      className="ease-spring flex flex-none items-center gap-1 rounded-lg border border-silver px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2"
                    >
                      <UserRound className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Ver perfil
                    </button>
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

      {/* Panel lateral (hermano del modal, no un overlay encima) — clic en
          "Ver perfil" de otro cliente reemplaza este mismo panel (verPerfilId
          es un solo valor), no se van apilando. */}
      {verPerfilId && <MiniPerfilVenceHoy clienteId={verPerfilId} onClose={() => setVerPerfilId(null)} />}
    </div>
  );
}

// Mismo espíritu que PerfilExistenteResumen (solicitudes/page.tsx): lo
// esencial de un cliente, no el ClientePanel completo — para revisar antes
// de revocar sin salir de este modal. Las notas se muestran siempre (con
// "Sin notas." si no hay), no solo cuando existen — pedido explícito: hay
// que poder revisarlas antes de revocar a alguien.
function MiniPerfilVenceHoy({ clienteId, onClose }: { clienteId: string; onClose: () => void }) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/clientes/${encodeURIComponent(clienteId)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "No se pudo cargar el perfil");
        setCliente(data.cliente);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar el perfil"));
  }, [clienteId]);

  const chips = cliente
    ? [
        ...cliente.accesos.general.map((a) => `${a.cantidad} General${a.variante ? ` ${a.variante}` : ""}`),
        ...cliente.accesos.vip.map((a) => `${a.cantidad} VIP${a.variante ? ` ${a.variante}` : ""}`),
        ...cliente.accesos.black.map((a) => `${a.cantidad} Black`),
      ]
    : [];

  return (
    <div className="w-full max-w-sm flex-none animate-fade-in rounded-2xl border border-silver bg-surface p-5 shadow-xl md:max-h-[85vh] md:overflow-y-auto">
      {error && <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      {!cliente && !error && <p className="py-8 text-center text-sm text-muted">Cargando perfil…</p>}
      {cliente && (
        <>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{cliente.nombre}</h3>
              <p className="text-xs text-muted">{cliente.email}</p>
            </div>
            <button onClick={onClose} className="ease-spring rounded-full p-1.5 text-muted transition hover:bg-surface-2">
              <X className="h-4.5 w-4.5" strokeWidth={1.75} />
            </button>
          </div>

            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
              <DatoMini label="Teléfono" valor={cliente.telefono} />
              <DatoMini label="País" valor={cliente.pais} />
              <DatoMini label="Evento" valor={cliente.evento} />
              <DatoMini label="Tipo de membresía" valor={cliente.tipoMembresia} />
              <DatoMini label="Etiqueta" valor={cliente.etiqueta} />
              <DatoMini label="Acceso a plataforma" valor={cliente.accesoPlataforma} />
              <DatoMini
                label="Fecha de inscripción"
                valor={cliente.fechaInscripcion ? new Date(cliente.fechaInscripcion).toLocaleDateString("es-MX") : null}
              />
              <DatoMini
                label="Fecha de renovación"
                valor={cliente.fechaRenovacion ? new Date(cliente.fechaRenovacion).toLocaleDateString("es-MX") : null}
              />
            </div>

            <div className="mt-3">
              <p className="text-xs font-medium text-muted">Boletos actuales</p>
              {chips.length === 0 ? (
                <p className="text-xs text-foreground">Ninguno</p>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {chips.map((c) => (
                    <span key={c} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-foreground">
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3">
              <p className="text-xs font-medium text-muted">Notas</p>
              {cliente.notas ? (
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-xs text-foreground">
                  {cliente.notas}
                </p>
              ) : (
                <p className="mt-1 rounded-lg bg-surface-2 p-2.5 text-xs text-muted">Sin notas.</p>
              )}
            </div>

            <Link
              href="/clientes"
              target="_blank"
              className="ease-spring mt-4 flex items-center justify-center gap-1.5 rounded-lg border border-silver px-3 py-2 text-xs font-medium text-foreground transition hover:bg-surface-2"
            >
              Abrir perfil completo (pestaña nueva)
              <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
            </Link>
        </>
      )}
    </div>
  );
}

function DatoMini({ label, valor }: { label: string; valor: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="text-foreground">{valor?.trim() ? valor : "—"}</p>
    </div>
  );
}
