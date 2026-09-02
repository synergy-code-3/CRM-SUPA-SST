"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, Plus, X } from "lucide-react";
import { PAISES_AMERICA } from "@/lib/paises-america";
import { useSesion } from "@/lib/session-context";
import { ComboboxBuscador } from "./ComboboxBuscador";

const OPCIONES_PAIS = PAISES_AMERICA.map((p) => ({ valor: p.nombre, etiqueta: p.nombre, nota: p.lada }));
const OPCIONES_MEMBRESIA = ["3 Meses", "6 Meses", "12 Meses"].map((m) => ({ valor: m, etiqueta: m }));
const MAX_COMPROBANTES = 5;

type Slot = { key: number; archivo: File | null };
type CategoriaEvento = "presencial" | "webinar" | "otro";
type EventosPorTipo = { webinar: string[]; presencial: string[]; otro: string[] };

const CATEGORIAS: { valor: CategoriaEvento; label: string }[] = [
  { valor: "presencial", label: "Presencial" },
  { valor: "webinar", label: "Webinar" },
  { valor: "otro", label: "Otro" },
];

export function FormularioSolicitudCliente({ onEnviada }: { onEnviada: () => void }) {
  const { usuario } = useSesion();
  const esAdmin = usuario?.rol === "admin";

  const [form, setForm] = useState({
    nombre: "",
    correoPago: "",
    correoAcceso: "",
    telefono: "",
    pais: "",
    evento: "",
    tipoMembresia: "",
    etiqueta: "",
  });
  const [eventosPorTipo, setEventosPorTipo] = useState<EventosPorTipo>({ webinar: [], presencial: [], otro: [] });
  const [etiquetas, setEtiquetas] = useState<{ valor: string; etiqueta: string }[]>([]);
  const [categoriaEvento, setCategoriaEvento] = useState<CategoriaEvento | null>(null);
  // Solo admin puede saltarse el selector por categoría y buscar el evento
  // directamente en la lista completa, como funcionaba antes.
  const [modoDirecto, setModoDirecto] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([
    { key: 0, archivo: null },
    { key: 1, archivo: null },
  ]);
  const siguienteKey = useRef(2);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  useEffect(() => {
    fetch("/api/eventos-synergy")
      .then((r) => r.json())
      .then((data) =>
        setEventosPorTipo({
          webinar: data.webinar ?? [],
          presencial: data.presencial ?? [],
          otro: data.otro ?? [],
        })
      )
      .catch(() => setEventosPorTipo({ webinar: [], presencial: [], otro: [] }));
    fetch("/api/etiquetas-solicitud")
      .then((r) => r.json())
      .then((data) => setEtiquetas((data.opciones ?? []).map((v: string) => ({ valor: v, etiqueta: v }))))
      .catch(() => setEtiquetas([]));
  }, []);

  const todosLosEventos = [...eventosPorTipo.presencial, ...eventosPorTipo.webinar, ...eventosPorTipo.otro];

  function onCambiarPais(pais: string) {
    const lada = PAISES_AMERICA.find((p) => p.nombre === pais)?.lada ?? "";
    setForm((f) => ({
      ...f,
      pais,
      telefono: f.telefono.trim() ? f.telefono : lada ? `${lada} ` : f.telefono,
    }));
  }

  function onCambiarArchivo(key: number, archivo: File | null) {
    setSlots((s) => s.map((slot) => (slot.key === key ? { ...slot, archivo } : slot)));
  }

  function agregarSlot() {
    setSlots((s) => [...s, { key: siguienteKey.current++, archivo: null }]);
  }

  function quitarSlot(key: number) {
    setSlots((s) => (s.length <= 1 ? s : s.filter((slot) => slot.key !== key)));
  }

  const archivosSeleccionados = slots.filter((s) => s.archivo).length;
  const camposCompletos =
    form.nombre.trim() &&
    form.correoPago.trim() &&
    form.correoAcceso.trim() &&
    form.telefono.trim() &&
    form.evento.trim() &&
    form.tipoMembresia.trim();
  const puedeEnviar = camposCompletos && archivosSeleccionados > 0 && !enviando;

  async function enviar() {
    setEnviando(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("nombre", form.nombre);
      body.set("correoPago", form.correoPago);
      body.set("correoAcceso", form.correoAcceso);
      body.set("telefono", form.telefono);
      body.set("pais", form.pais);
      body.set("evento", form.evento);
      body.set("tipoMembresia", form.tipoMembresia);
      if (form.etiqueta) body.set("etiqueta", form.etiqueta);
      for (const slot of slots) {
        if (slot.archivo) body.append("comprobantes", slot.archivo);
      }

      const res = await fetch("/api/solicitudes", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo enviar la solicitud");
        return;
      }

      setForm({ nombre: "", correoPago: "", correoAcceso: "", telefono: "", pais: "", evento: "", tipoMembresia: "", etiqueta: "" });
      setCategoriaEvento(null);
      setSlots([
        { key: 0, archivo: null },
        { key: 1, archivo: null },
      ]);
      siguienteKey.current = 2;
      setExito(true);
      setTimeout(() => setExito(false), 4000);
      onEnviada();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="shell rounded-[2rem] p-2 diffused-lg">
      <div className="core space-y-4 rounded-[calc(2rem-0.5rem)] p-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">Nueva solicitud</h2>
          <p className="text-sm text-muted">
            Llena los datos del cliente y adjunta su comprobante de pago. Un administrador la revisa y crea el
            cliente en el CRM.
          </p>
        </div>

        <div className="space-y-3">
          <Campo label="Nombre completo *">
            <input
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
            />
          </Campo>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Correo de pago *">
              <input
                type="email"
                value={form.correoPago}
                onChange={(e) => setForm((f) => ({ ...f, correoPago: e.target.value }))}
                placeholder="Con el que pagó"
                className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
              />
            </Campo>
            <Campo label="Correo de acceso *">
              <input
                type="email"
                value={form.correoAcceso}
                onChange={(e) => setForm((f) => ({ ...f, correoAcceso: e.target.value }))}
                placeholder="Con el que entra a la plataforma"
                className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
              />
            </Campo>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Campo label="País *">
              <ComboboxBuscador
                opciones={OPCIONES_PAIS}
                valor={form.pais}
                onChange={onCambiarPais}
                placeholder="Seleccionar país…"
              />
            </Campo>
            <Campo label="Teléfono *">
              <input
                value={form.telefono}
                onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
              />
            </Campo>
            <Campo label="Tipo de membresía *">
              <ComboboxBuscador
                opciones={OPCIONES_MEMBRESIA}
                valor={form.tipoMembresia}
                onChange={(tipoMembresia) => setForm((f) => ({ ...f, tipoMembresia }))}
                placeholder="Seleccionar…"
              />
            </Campo>
            <Campo label="Etiqueta (opcional)">
              <ComboboxBuscador
                opciones={etiquetas}
                valor={form.etiqueta}
                onChange={(etiqueta) => setForm((f) => ({ ...f, etiqueta }))}
                placeholder="Seleccionar…"
                etiquetaVacio="— Ninguna —"
              />
            </Campo>
          </div>

          <Campo label="Evento *">
            {esAdmin && (
              <button
                type="button"
                onClick={() => {
                  setModoDirecto((m) => !m);
                  setCategoriaEvento(null);
                  setForm((f) => ({ ...f, evento: "" }));
                }}
                className="ease-spring mb-1.5 block text-xs font-medium text-primary transition hover:text-primary-deep"
              >
                {modoDirecto ? "Usar selector por categoría" : "Buscar directamente"}
              </button>
            )}
            {modoDirecto ? (
              <ComboboxBuscador
                opciones={todosLosEventos.map((e) => ({ valor: e, etiqueta: e }))}
                valor={form.evento}
                onChange={(evento) => setForm((f) => ({ ...f, evento }))}
                placeholder="Seleccionar evento…"
              />
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <ComboboxBuscador
                  opciones={CATEGORIAS.map((c) => ({ valor: c.valor, etiqueta: c.label }))}
                  valor={categoriaEvento ?? ""}
                  onChange={(v) => {
                    setCategoriaEvento((v as CategoriaEvento) || null);
                    setForm((f) => ({ ...f, evento: "" }));
                  }}
                  placeholder="Categoría del evento…"
                />
                {categoriaEvento ? (
                  <ComboboxBuscador
                    opciones={eventosPorTipo[categoriaEvento].map((e) => ({ valor: e, etiqueta: e }))}
                    valor={form.evento}
                    onChange={(evento) => setForm((f) => ({ ...f, evento }))}
                    placeholder="Seleccionar evento…"
                  />
                ) : (
                  <p className="flex items-center rounded-lg border border-dashed border-silver bg-surface-2 px-3 py-1.5 text-xs text-muted">
                    Elige una categoría primero
                  </p>
                )}
              </div>
            )}
          </Campo>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">Comprobante de pago * (al menos 1)</span>
            <div className="space-y-2">
              {slots.map((slot, i) => (
                <div key={slot.key} className="flex items-center gap-2">
                  <label className="ease-spring flex flex-1 items-center gap-2 rounded-lg border border-dashed border-silver bg-surface-2 px-3 py-2 text-sm text-muted transition hover:border-primary/40">
                    <Paperclip className="h-4 w-4 flex-none" strokeWidth={1.75} />
                    <span className="truncate">{slot.archivo ? slot.archivo.name : `Comprobante ${i + 1}`}</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => onCambiarArchivo(slot.key, e.target.files?.[0] ?? null)}
                      className="hidden"
                    />
                  </label>
                  {slots.length > 1 && (
                    <button
                      type="button"
                      onClick={() => quitarSlot(slot.key)}
                      className="ease-spring flex-none rounded-lg p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger"
                    >
                      <X className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {slots.length < MAX_COMPROBANTES && (
              <button
                type="button"
                onClick={agregarSlot}
                className="ease-spring mt-2 flex items-center gap-1 text-xs font-medium text-primary transition hover:text-primary-deep"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Agregar otro comprobante
              </button>
            )}
          </div>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}
        {exito && <p className="text-xs text-success">Solicitud enviada — quedó pendiente de revisión.</p>}

        <button
          onClick={enviar}
          disabled={!puedeEnviar}
          className="ease-spring w-full rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-40"
        >
          {enviando ? "Enviando…" : "Enviar solicitud"}
        </button>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
