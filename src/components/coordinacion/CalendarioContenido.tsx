"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X, GraduationCap, CalendarPlus } from "lucide-react";
import { TIPOS_MENTORIA, mentoriaVacia, type Mentor, type Mentoria, type EventoInterno } from "@/lib/coordinacion";
import { PanelMentoria } from "./PanelMentoria";

const COLORES_EVENTO = ["#3B82F6", "#10B981", "#A855F7", "#F59E0B"];
const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const NOMBRES_DIA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function iso(anio: number, mesIndex0: number, dia: number): string {
  return `${anio}-${pad2(mesIndex0 + 1)}-${pad2(dia)}`;
}

// Genera la cuadrícula del mes (semanas de lunes a domingo), incluyendo los
// días del mes anterior/siguiente que completan la primera/última semana.
function celdasDelMes(anio: number, mesIndex0: number): { fecha: string; delMes: boolean }[] {
  const primerDia = new Date(Date.UTC(anio, mesIndex0, 1));
  const diaSemanaLunes0 = (primerDia.getUTCDay() + 6) % 7; // 0 = lunes
  const diasEnMes = new Date(Date.UTC(anio, mesIndex0 + 1, 0)).getUTCDate();
  const celdas: { fecha: string; delMes: boolean }[] = [];

  for (let i = 0; i < diaSemanaLunes0; i++) {
    const d = new Date(Date.UTC(anio, mesIndex0, 1 - (diaSemanaLunes0 - i)));
    celdas.push({ fecha: iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), delMes: false });
  }
  for (let dia = 1; dia <= diasEnMes; dia++) celdas.push({ fecha: iso(anio, mesIndex0, dia), delMes: true });
  while (celdas.length % 7 !== 0) {
    const ultima = celdas[celdas.length - 1].fecha;
    const [y, m, d] = ultima.split("-").map(Number);
    const sig = new Date(Date.UTC(y, m - 1, d + 1));
    celdas.push({ fecha: iso(sig.getUTCFullYear(), sig.getUTCMonth(), sig.getUTCDate()), delMes: false });
  }
  return celdas;
}

function eventoVacio(fecha: string) {
  return { id: "", titulo: "", fecha, color: COLORES_EVENTO[3], horaInicio: "", horaFin: "", enlace: "", invitados: "", notas: "", descripcion: "" };
}

export function CalendarioContenido() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mesIndex0, setMesIndex0] = useState(hoy.getMonth());
  const [mentorias, setMentorias] = useState<Mentoria[]>([]);
  const [mentores, setMentores] = useState<Mentor[]>([]);
  const [eventos, setEventos] = useState<EventoInterno[]>([]);
  const [modal, setModal] = useState<ReturnType<typeof eventoVacio> | null>(null);
  const [panelMentoria, setPanelMentoria] = useState<Mentoria | null>(null);
  const [mostrarElegirTipo, setMostrarElegirTipo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elegirTipoRef = useRef<HTMLDivElement>(null);

  const celdas = useMemo(() => celdasDelMes(anio, mesIndex0), [anio, mesIndex0]);
  const desde = celdas[0].fecha;
  const hasta = celdas[celdas.length - 1].fecha;

  function cargar() {
    fetch("/api/coordinacion/mentorias")
      .then((r) => r.json())
      .then((data) => setMentorias(data.mentorias ?? []))
      .catch(() => {});
    fetch(`/api/coordinacion/eventos?desde=${desde}&hasta=${hasta}`)
      .then((r) => r.json())
      .then((data) => setEventos(data.eventos ?? []))
      .catch(() => {});
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  useEffect(() => {
    fetch("/api/coordinacion/mentores")
      .then((r) => r.json())
      .then((data) => setMentores(data.mentores ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!mostrarElegirTipo) return;
    function alClicFuera(e: MouseEvent) {
      if (elegirTipoRef.current && !elegirTipoRef.current.contains(e.target as Node)) setMostrarElegirTipo(false);
    }
    document.addEventListener("mousedown", alClicFuera);
    return () => document.removeEventListener("mousedown", alClicFuera);
  }, [mostrarElegirTipo]);

  const opcionesMentor = useMemo(() => mentores.map((m) => ({ valor: m.id, etiqueta: m.nombre })), [mentores]);

  const mentoriasPorFecha = useMemo(() => {
    const mapa = new Map<string, Mentoria[]>();
    for (const m of mentorias) {
      if (!mapa.has(m.fecha)) mapa.set(m.fecha, []);
      mapa.get(m.fecha)!.push(m);
    }
    return mapa;
  }, [mentorias]);

  const eventosPorFecha = useMemo(() => {
    const mapa = new Map<string, EventoInterno[]>();
    for (const e of eventos) {
      if (!mapa.has(e.fecha)) mapa.set(e.fecha, []);
      mapa.get(e.fecha)!.push(e);
    }
    return mapa;
  }, [eventos]);

  function cambiarMes(delta: number) {
    let m = mesIndex0 + delta;
    let a = anio;
    if (m < 0) {
      m = 11;
      a -= 1;
    } else if (m > 11) {
      m = 0;
      a += 1;
    }
    setMesIndex0(m);
    setAnio(a);
  }

  async function guardarEvento() {
    if (!modal || !modal.titulo.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      const esNuevo = !modal.id;
      const res = await fetch(esNuevo ? "/api/coordinacion/eventos" : `/api/coordinacion/eventos/${modal.id}`, {
        method: esNuevo ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modal),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      setModal(null);
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarEvento() {
    if (!modal?.id) return;
    if (!window.confirm("¿Eliminar este evento?")) return;
    await fetch(`/api/coordinacion/eventos/${modal.id}`, { method: "DELETE" });
    setModal(null);
    cargar();
  }

  async function eliminarMentoria(id: string) {
    if (!window.confirm("¿Eliminar esta mentoría? No se puede deshacer.")) return;
    await fetch(`/api/coordinacion/mentorias/${id}`, { method: "DELETE" });
    setPanelMentoria(null);
    cargar();
  }

  const hoyIso = iso(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <CalendarDays className="h-6 w-6 text-primary" strokeWidth={1.75} />
            Calendario
          </h1>
          <p className="text-sm text-muted">Mentorías y eventos internos del equipo de coordinación.</p>
        </div>
        <div ref={elegirTipoRef} className="relative">
          <button
            onClick={() => setMostrarElegirTipo((v) => !v)}
            className="ease-spring flex items-center gap-1.5 rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Nuevo
          </button>
          {mostrarElegirTipo && (
            <div className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-xl border border-silver bg-surface py-1 diffused-lg">
              <button
                onClick={() => {
                  setMostrarElegirTipo(false);
                  setModal(eventoVacio(hoyIso));
                }}
                className="ease-spring flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-foreground transition hover:bg-surface-2"
              >
                <CalendarPlus className="h-4 w-4 text-muted" strokeWidth={1.75} />
                Evento
              </button>
              <button
                onClick={() => {
                  setMostrarElegirTipo(false);
                  setPanelMentoria(mentoriaVacia(hoyIso));
                }}
                className="ease-spring flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-foreground transition hover:bg-surface-2"
              >
                <GraduationCap className="h-4 w-4 text-muted" strokeWidth={1.75} />
                Mentoría
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}

      <div className="shell rounded-[1.75rem] p-2 diffused">
        <div className="core rounded-[calc(1.75rem-0.5rem)] p-6">
          <div className="mb-4 flex items-center justify-between">
            <button onClick={() => cambiarMes(-1)} className="ease-spring rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-foreground">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
            </button>
            <h2 className="text-base font-semibold text-foreground">
              {NOMBRES_MES[mesIndex0]} {anio}
            </h2>
            <button onClick={() => cambiarMes(1)} className="ease-spring rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-foreground">
              <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">
            {NOMBRES_DIA.map((d) => (
              <div key={d} className="py-1.5">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {celdas.map(({ fecha, delMes }) => {
              const dia = Number(fecha.slice(8, 10));
              const mentoriasDia = mentoriasPorFecha.get(fecha) ?? [];
              const eventosDia = eventosPorFecha.get(fecha) ?? [];
              return (
                <div
                  key={fecha}
                  className={`min-h-[88px] rounded-lg border p-1.5 text-left align-top ${
                    fecha === hoyIso ? "border-primary/50 bg-primary-dim" : "border-silver/60"
                  } ${delMes ? "" : "opacity-40"}`}
                >
                  <p className="mb-1 text-xs font-medium text-muted">{dia}</p>
                  <div className="space-y-1">
                    {mentoriasDia.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setPanelMentoria(m)}
                        title={`${TIPOS_MENTORIA[m.tipoMentoria].label}${m.tema ? ` — ${m.tema}` : ""}`}
                        className="ease-spring block w-full truncate rounded bg-primary-dim px-1.5 py-0.5 text-left text-[11px] font-medium text-primary-deep transition hover:brightness-95"
                      >
                        {TIPOS_MENTORIA[m.tipoMentoria].label}
                      </button>
                    ))}
                    {eventosDia.map((e) => (
                      <button
                        key={e.id}
                        onClick={() =>
                          setModal({
                            id: e.id,
                            titulo: e.titulo,
                            fecha: e.fecha,
                            color: e.color ?? COLORES_EVENTO[3],
                            horaInicio: e.horaInicio ?? "",
                            horaFin: e.horaFin ?? "",
                            enlace: e.enlace ?? "",
                            invitados: e.invitados ?? "",
                            notas: e.notas ?? "",
                            descripcion: e.descripcion ?? "",
                          })
                        }
                        title={e.titulo}
                        className="ease-spring block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white transition hover:brightness-95"
                        style={{ backgroundColor: e.color ?? COLORES_EVENTO[3] }}
                      >
                        {e.titulo}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {modal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-foreground/30 p-6 backdrop-blur-[2px]"
          onClick={(e) => e.target === e.currentTarget && setModal(null)}
        >
          <div className="shell w-full max-w-lg rounded-[2rem] p-2 diffused-lg animate-fade-in">
            <div className="core space-y-4 rounded-[calc(2rem-0.5rem)] p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-foreground">{modal.id ? "Editar evento" : "Nuevo evento"}</h2>
                <button onClick={() => setModal(null)} className="ease-spring rounded-full p-1.5 text-muted transition hover:bg-surface-2">
                  <X className="h-4.5 w-4.5" strokeWidth={1.75} />
                </button>
              </div>
              <Campo label="Título *">
                <input value={modal.titulo} onChange={(e) => setModal({ ...modal, titulo: e.target.value })} className="w-full rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
              </Campo>
              <div className="grid grid-cols-3 gap-3">
                <Campo label="Fecha *">
                  <input type="date" value={modal.fecha} onChange={(e) => setModal({ ...modal, fecha: e.target.value })} className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
                </Campo>
                <Campo label="Hora inicio">
                  <input type="time" value={modal.horaInicio} onChange={(e) => setModal({ ...modal, horaInicio: e.target.value })} className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
                </Campo>
                <Campo label="Hora fin">
                  <input type="time" value={modal.horaFin} onChange={(e) => setModal({ ...modal, horaFin: e.target.value })} className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
                </Campo>
              </div>
              <div>
                <span className="mb-1.5 block text-sm font-medium text-muted">Color</span>
                <div className="flex gap-2">
                  {COLORES_EVENTO.map((c) => (
                    <button
                      key={c}
                      onClick={() => setModal({ ...modal, color: c })}
                      style={{ backgroundColor: c }}
                      className={`h-7 w-7 rounded-full transition ${modal.color === c ? "ring-2 ring-offset-2 ring-foreground" : ""}`}
                    />
                  ))}
                </div>
              </div>
              <Campo label="Enlace (Meet/Zoom/Teams)">
                <input value={modal.enlace} onChange={(e) => setModal({ ...modal, enlace: e.target.value })} className="w-full rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
              </Campo>
              <Campo label="Invitados">
                <input value={modal.invitados} onChange={(e) => setModal({ ...modal, invitados: e.target.value })} placeholder="Separados por coma" className="w-full rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
              </Campo>
              <Campo label="Descripción">
                <textarea value={modal.descripcion} onChange={(e) => setModal({ ...modal, descripcion: e.target.value })} rows={2} className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
              </Campo>
              <Campo label="Notas internas">
                <textarea value={modal.notas} onChange={(e) => setModal({ ...modal, notas: e.target.value })} rows={2} className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
              </Campo>
              <div className="flex items-center justify-between pt-1">
                {modal.id ? (
                  <button onClick={eliminarEvento} className="text-sm font-medium text-danger hover:underline">
                    Eliminar
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button onClick={() => setModal(null)} className="ease-spring rounded-xl border border-silver px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface-2">
                    Cancelar
                  </button>
                  <button onClick={guardarEvento} disabled={!modal.titulo.trim() || guardando} className="ease-spring rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-40">
                    {guardando ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {panelMentoria && (
        <PanelMentoria
          mentoria={panelMentoria}
          opcionesMentor={opcionesMentor}
          onCerrar={() => setPanelMentoria(null)}
          onGuardado={() => cargar()}
          onEliminar={eliminarMentoria}
        />
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
