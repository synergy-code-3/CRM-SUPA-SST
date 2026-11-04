"use client";

import { useMemo, useState } from "react";
import { Eye, FileDown, Loader2, RefreshCw } from "lucide-react";
import { Modal } from "./Modal";
import { Paginador } from "./Paginador";
import { VerHojaModal } from "./VerHojaModal";
import { useSesion } from "@/lib/session-context";
import { useDatosEnCache } from "@/lib/captura-datos/useDatosEnCache";
import { api } from "@/lib/captura-datos/cliente";
import { duracionLegible, estadisticasDeCaptura, fechaHoraCompleta, ETIQUETA_ACCION, lineasDeDetalle, type HojaDeCaptura, type ResumenCaptura } from "@/lib/captura-datos/historial";
import { paginar } from "@/lib/captura-datos/paginacion";
import { abrirInforme } from "@/lib/captura-datos/pdf-captura";
import type { HojaCaptura } from "@/lib/captura-datos/modelo";
import type { RegistroAuditoria } from "@/lib/captura-datos/historial";

type Filtro = "todas" | "rapidas" | "sinCambios" | "otros";
const FILTROS: [Filtro, string][] = [["todas", "Todas"], ["rapidas", "Muy rápidas"], ["sinCambios", "Sin cambios"], ["otros", "Otros movimientos"]];
const HOJAS_POR_PAGINA = 15;
const PERIODO = "Todo el historial";
const seg = (s: number | null) => (s === null ? "—" : duracionLegible(s));

interface Props {
  fila: ResumenCaptura;
  onCerrar: () => void;
}

/** Detalle hoja por hoja de lo que una persona capturó en un evento, con descarga en PDF. */
export function DetalleCapturaModal({ fila, onCerrar }: Props) {
  const { usuario } = useSesion();
  const [avisoLocal, setAvisoLocal] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [pagina, setPagina] = useState(0);
  const [viendo, setViendo] = useState<HojaCaptura | null>(null);
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const { datos, error: errorCarga, recargar } = useDatosEnCache<{ hojas: HojaDeCaptura[]; otros: RegistroAuditoria[] }>(usuario?.id, `detalle:${fila.eventoId}:${fila.usuarioId}`, () => {
    const p = new URLSearchParams();
    if (fila.eventoId) p.set("eventoId", fila.eventoId);
    if (fila.usuarioId) p.set("usuarioId", fila.usuarioId);
    return api<{ hojas: HojaDeCaptura[]; otros: RegistroAuditoria[] }>(`/api/captura-datos/historial/reporte?${p}`);
  });
  const hojas = datos?.hojas ?? null;
  const otros = datos?.otros ?? [];
  const error = errorCarga ?? avisoLocal;

  const visibles = useMemo(() => (hojas ?? []).filter((h) => filtro === "todas" || (filtro === "rapidas" ? h.rapida : filtro === "sinCambios" ? h.sinCambios : false)), [hojas, filtro]);
  const { items: enPagina, pagina: paginaActual, paginas } = paginar(visibles, pagina, HOJAS_POR_PAGINA);
  const confirmadas = useMemo(() => (hojas ?? []).filter((h) => h.tipo === "confirmada"), [hojas]);
  const stats = useMemo(() => estadisticasDeCaptura(confirmadas), [confirmadas]);
  const enOtros = filtro === "otros";

  async function verHoja(id: string) {
    setAbriendo(id);
    try {
      setViendo((await api<{ hoja: HojaCaptura }>(`/api/captura-datos/hojas/${id}`)).hoja);
    } catch (e) {
      setAvisoLocal(e instanceof Error ? e.message : "No se pudo abrir la hoja.");
    } finally {
      setAbriendo(null);
    }
  }

  function informe(imprimir: boolean) {
    if (!hojas) return;
    const abierto = abrirInforme({ usuario: fila.usuario, evento: fila.eventoNombre ?? "Evento borrado", periodo: PERIODO, hojas: confirmadas }, imprimir);
    if (!abierto) setAvisoLocal("El navegador bloqueó la ventana. Permite las ventanas emergentes para este sitio.");
  }

  return (
    <Modal titulo={`Detalle de ${fila.usuario}`} onCerrar={onCerrar} tamano="max-h-[88vh] sm:max-w-5xl">
      <div className="space-y-3 text-sm">
        <p className="text-muted">{fila.eventoNombre ?? "Evento borrado"}</p>
        {error && <p role="alert" className="text-danger">{error}</p>}
        {!hojas && !error && <p className="py-6 text-center text-muted">Cargando…</p>}
        {hojas && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span>{confirmadas.length} hojas</span>
              {hojas.length > confirmadas.length && <span>{hojas.length - confirmadas.length} correcciones o borrados</span>}
              <span>Mínimo {seg(stats.minimo)}</span>
              <span>Mediana {seg(stats.mediana)}</span>
              <span>Máximo {seg(stats.maximo)}</span>
              <span className="ml-auto flex gap-2">
                <button onClick={recargar} className="inline-flex items-center gap-1 rounded-lg border border-silver px-3 py-1.5 text-sm hover:bg-silver/40" title="Volver a pedir los datos">
                  <RefreshCw className="h-4 w-4" /> Actualizar
                </button>
                <button onClick={() => informe(false)} className="inline-flex items-center gap-1 rounded-lg border border-silver px-3 py-1.5 text-sm hover:bg-silver/40">
                  <Eye className="h-4 w-4" /> Ver PDF
                </button>
                <button onClick={() => informe(true)} className="inline-flex items-center gap-1 rounded-lg border border-silver px-3 py-1.5 text-sm hover:bg-silver/40">
                  <FileDown className="h-4 w-4" /> Descargar PDF
                </button>
              </span>
            </div>
            <div className="flex gap-2">
              {FILTROS.map(([k, etiqueta]) => (
                <button key={k} onClick={() => { setFiltro(k); setPagina(0); }} aria-pressed={filtro === k} className={`rounded-lg px-3 py-1 text-xs ${filtro === k ? "bg-primary text-white" : "border border-silver"}`}>{etiqueta}</button>
              ))}
            </div>
            {enOtros ? (otros.length === 0 ? <p className="py-4 text-center text-muted">Sin otros movimientos.</p> : (
              <ul className="divide-y divide-silver/60 text-xs">
                {otros.map((r) => (
                  <li key={r.id} className="py-2">
                    <p className="font-medium text-foreground">{ETIQUETA_ACCION[r.accion] ?? r.accion} <span className="font-normal text-muted">· {fechaHoraCompleta(r.en)}</span></p>
                    {lineasDeDetalle(r).map((l) => <p key={l} className="text-muted">{l}</p>)}
                  </li>
                ))}
              </ul>
            )) : visibles.length === 0 ? <p className="py-4 text-center text-muted">Ninguna hoja coincide.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[46rem] text-left text-xs">
                  <thead className="text-muted">
                    <tr><th className="py-1.5 pr-3 font-medium">Foto</th><th className="pr-3 font-medium">Folio</th><th className="pr-3 font-medium">Inició</th><th className="pr-3 font-medium">Terminó</th><th className="pr-3 font-medium">Duración</th><th className="pr-3 font-medium">Guardados</th><th className="pr-3 font-medium">Desde la anterior</th><th className="font-medium">Alertas</th><th /></tr>
                  </thead>
                  <tbody className="divide-y divide-silver/60">
                    {enPagina.map((h, i) => (
                      <tr key={h.hojaId ?? i} className={`align-middle ${h.rapida || h.sinCambios ? "bg-warning/5" : ""}`}>
                        <td className="py-2 pr-3 font-medium text-foreground">{h.foto ?? "No disponible"}</td>
                        <td className="py-2 pr-3">{h.folio || "—"}</td>
                        <td className="py-2 pr-3">{h.inicio ? fechaHoraCompleta(h.inicio) : "—"}</td>
                        <td className="py-2 pr-3">{fechaHoraCompleta(h.fin)}</td>
                        <td className="py-2 pr-3">{seg(h.segundos)}</td>
                        <td className="py-2 pr-3">{h.guardados ?? "—"}</td>
                        <td className="py-2 pr-3">{seg(h.desdeAnteriorSegundos)}</td>
                        <td className="space-x-1 py-2 pr-3">
                          {h.rapida && <span className="rounded bg-danger/10 px-1.5 py-0.5 font-medium text-danger">Muy rápida</span>}
                          {h.sinCambios && <span className="rounded bg-warning/10 px-1.5 py-0.5 font-medium text-warning">Sin cambios</span>}
                          {h.tipo === "corregida" && <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">Corregida</span>}
                          {h.tipo === "borrada" && <span className="rounded bg-danger/10 px-1.5 py-0.5 font-medium text-danger">Borrada</span>}
                          {h.tipo !== "confirmada" && h.cambios?.map((c) => <span key={c} className="block text-muted">{c}</span>)}
                          {h.tipo === "confirmada" && h.segundos === null && <span className="text-muted">Sin medición</span>}
                        </td>
                        <td className="py-2">{h.hojaId && h.foto && <button onClick={() => void verHoja(h.hojaId!)} disabled={abriendo !== null} aria-label="Ver hoja" className="text-primary disabled:opacity-60">{abriendo === h.hojaId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!enOtros && <Paginador pagina={paginaActual} paginas={paginas} total={visibles.length} onCambio={setPagina} />}
          </>
        )}
      </div>
      {viendo && <VerHojaModal hoja={viendo} onCerrar={() => setViendo(null)} />}
    </Modal>
  );
}
