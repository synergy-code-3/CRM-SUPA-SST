"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, Plus, X } from "lucide-react";
import { REGIONES_CERTIFICACION, REGION_CERTIFICACION_LABEL } from "@/lib/certificaciones-tipos";
import { ComboboxBuscador } from "./ComboboxBuscador";

const OPCIONES_REGION = REGIONES_CERTIFICACION.map((r) => ({ valor: r, etiqueta: REGION_CERTIFICACION_LABEL[r] }));
const MAX_COMPROBANTES = 5;

type Slot = { key: number; archivo: File | null };

export function FormularioSolicitudCertificacion({ onEnviada }: { onEnviada: () => void }) {
  const [form, setForm] = useState({
    nombre: "",
    correo: "",
    telefono: "",
    region: "",
    monto: "",
    etiqueta: "",
    notas: "",
  });
  const [certificaciones, setCertificaciones] = useState<{ valor: string; etiqueta: string }[]>([]);
  const [slots, setSlots] = useState<Slot[]>([
    { key: 0, archivo: null },
    { key: 1, archivo: null },
  ]);
  const siguienteKey = useRef(2);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  useEffect(() => {
    fetch("/api/certificaciones-solicitud/catalogo")
      .then((r) => r.json())
      .then((data) => setCertificaciones((data.opciones ?? []).map((v: string) => ({ valor: v, etiqueta: v }))))
      .catch(() => setCertificaciones([]));
  }, []);

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
  const telefonoCompleto = form.telefono.replace(/\D/g, "").length >= 8;
  const camposCompletos = form.nombre.trim() && form.correo.trim() && telefonoCompleto;
  const puedeEnviar = camposCompletos && archivosSeleccionados > 0 && !enviando;

  async function enviar() {
    setEnviando(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("nombre", form.nombre);
      body.set("correo", form.correo);
      body.set("telefono", form.telefono);
      if (form.region) body.set("region", form.region);
      if (form.monto) body.set("monto", form.monto);
      if (form.etiqueta) body.set("etiqueta", form.etiqueta);
      if (form.notas) body.set("notas", form.notas);
      for (const slot of slots) {
        if (slot.archivo) body.append("comprobantes", slot.archivo);
      }

      const res = await fetch("/api/solicitudes-certificacion", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo enviar la solicitud");
        return;
      }

      setForm({ nombre: "", correo: "", telefono: "", region: "", monto: "", etiqueta: "", notas: "" });
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
          <h2 className="text-base font-semibold text-foreground">Nueva solicitud — Certificaciones</h2>
          <p className="text-sm text-muted">
            Llena los datos del socio y adjunta su comprobante de pago. Un administrador la revisa y crea el
            cliente en Certificaciones.
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
            <Campo label="Correo *">
              <input
                type="email"
                value={form.correo}
                onChange={(e) => setForm((f) => ({ ...f, correo: e.target.value }))}
                className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
              />
            </Campo>
            <Campo label="Teléfono *">
              <input
                value={form.telefono}
                onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
              />
              {form.telefono.trim() && !telefonoCompleto && (
                <span className="mt-1 block text-xs text-danger">Falta el número, no solo la lada</span>
              )}
            </Campo>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Campo label="Región">
              <ComboboxBuscador
                opciones={OPCIONES_REGION}
                valor={form.region}
                onChange={(region) => setForm((f) => ({ ...f, region }))}
                placeholder="Seleccionar región…"
              />
            </Campo>
            <Campo label="Monto">
              <input
                value={form.monto}
                onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
                className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
              />
            </Campo>
            <Campo label="Certificación (opcional)">
              <ComboboxBuscador
                opciones={certificaciones}
                valor={form.etiqueta}
                onChange={(etiqueta) => setForm((f) => ({ ...f, etiqueta }))}
                placeholder="Seleccionar…"
                etiquetaVacio="— Ninguna —"
              />
            </Campo>
          </div>

          <Campo label="Notas (opcional)">
            <textarea
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              placeholder="Cualquier detalle que el admin deba saber al revisar…"
              rows={3}
              className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
            />
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
