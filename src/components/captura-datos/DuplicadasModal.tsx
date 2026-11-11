"use client";

import { useState } from "react";
import { Eye, Loader2, Trash2, Unlink } from "lucide-react";
import { Modal } from "./Modal";
import { mensajeError } from "./mensajeError";
import { api } from "@/lib/captura-datos/cliente";
import { esSecundaria } from "@/lib/captura-datos/duplicadas";
import type { HojaCaptura } from "@/lib/captura-datos/modelo";

interface DuplicadasModalProps {
  grupo: HojaCaptura[];
  actualId: string;
  onCerrar: () => void;
  onVer: (h: HojaCaptura) => void;
  preparar: () => Promise<boolean>;
  onHecho: (principalId?: string) => void | Promise<void>;
}

export function DuplicadasModal({ grupo, actualId, onCerrar, onVer, preparar, onHecho }: DuplicadasModalProps) {
  const principales = grupo.filter((h) => !esSecundaria(h));
  const [principal, setPrincipal] = useState((principales.length === 1 ? principales[0] : grupo.find((h) => h.id === actualId) ?? grupo[0]).id);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const yaVinculadas = principales.length === 1 && principales[0].id === principal;

  async function ejecutar(clave: string, id: string, cuerpo: { accion: string; ids?: string[] }, principalId?: string) {
    setOcupado(clave);
    setError(null);
    try {
      if (!(await preparar())) return;
      await api(`/api/captura-datos/hojas/${id}/duplicadas`, { json: cuerpo });
      await onHecho(principalId);
    } catch (err) {
      setError(mensajeError(err, "No se pudo completar."));
    } finally {
      setOcupado(null);
    }
  }

  const ancla = (h: HojaCaptura) => grupo.find((g) => g.id !== h.id)!.id;

  return (
    <Modal titulo="Hojas repetidas" onCerrar={onCerrar} bloqueado={ocupado !== null}>
      <div className="space-y-3">
        <p className="text-sm text-muted">Tienen el mismo teléfono. Elige la principal: es la que se captura y va a la Hoja de cálculo. Las demás solo se ven y su foto se guarda en Drive.</p>
        <ul className="divide-y divide-silver/60 rounded-lg border border-silver">
          {grupo.map((h) => (
            <li key={h.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <input type="radio" name="principal" aria-label="Principal" checked={principal === h.id} onChange={() => setPrincipal(h.id)} disabled={ocupado !== null} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/captura-datos/hojas/${h.id}/foto`} alt="" className="h-10 w-8 shrink-0 rounded bg-black/5 object-contain" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-foreground">{h.campos?.nombre || h.origen.nombreOriginal}{h.id === actualId && " (esta)"}</span>
                <span className="block text-xs text-muted">{h.folio ? `Folio ${h.folio} · ` : ""}{esSecundaria(h) ? "Secundaria" : h.estado === "confirmada" ? "Confirmada" : "Sin confirmar"}</span>
              </span>
              <button type="button" onClick={() => onVer(h)} aria-label="Ver" title="Ver" className="text-muted hover:text-primary"><Eye className="h-4 w-4" /></button>
              {esSecundaria(h) && (
                <button type="button" onClick={() => ejecutar(`d${h.id}`, h.id, { accion: "desvincular" })} disabled={ocupado !== null} aria-label="Desvincular" title="Desvincular" className="text-muted hover:text-primary disabled:opacity-50">
                  {ocupado === `d${h.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                </button>
              )}
              {h.id !== actualId && (
                <button type="button" onClick={() => ejecutar(`b${h.id}`, ancla(h), { accion: "borrar", ids: [h.id] })} disabled={ocupado !== null} aria-label="Borrar" title="Borrar" className="text-muted hover:text-danger disabled:opacity-50">
                  {ocupado === `b${h.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              )}
            </li>
          ))}
        </ul>
        {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={ocupado !== null} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-silver/40 disabled:opacity-50">Cerrar</button>
          <button type="button" onClick={() => ejecutar("v", principal, { accion: "vincular", ids: grupo.filter((h) => h.id !== principal).map((h) => h.id) }, principal)} disabled={ocupado !== null || yaVinculadas} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {ocupado === "v" && <Loader2 className="h-4 w-4 animate-spin" />} Vincular
          </button>
        </div>
      </div>
    </Modal>
  );
}
