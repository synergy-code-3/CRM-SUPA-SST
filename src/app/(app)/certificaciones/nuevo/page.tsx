"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ComboboxBuscador } from "@/components/ComboboxBuscador";
import { REGIONES_CERTIFICACION, REGION_CERTIFICACION_LABEL } from "@/lib/certificaciones-tipos";

const OPCIONES_REGION = REGIONES_CERTIFICACION.map((r) => ({ valor: r, etiqueta: REGION_CERTIFICACION_LABEL[r] }));

export default function NuevoClienteCertificacionPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    nombre: "",
    email: "",
    telefono: "",
    region: "",
    notas: "",
    monto: "",
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeEnviar = form.nombre.trim() && form.email.trim() && !enviando;

  async function crear() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/certificaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear el cliente");
        return;
      }
      router.push(`/certificaciones/${encodeURIComponent(data.cliente.id)}`);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Nuevo cliente — Certificaciones</h1>
        <p className="text-sm text-muted">Alta directa, sin pasar por ningún pipeline de seguimiento.</p>
      </div>

      <div className="shell rounded-2xl p-2 diffused">
        <div className="core space-y-3 rounded-[calc(1rem-0.5rem)] p-5">
          <Campo label="Nombre completo *">
            <input
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
            />
          </Campo>
          <Campo label="Correo *">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
            />
          </Campo>
          <Campo label="Teléfono">
            <input
              value={form.telefono}
              onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
              className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
            />
          </Campo>
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
          <Campo label="Notas">
            <textarea
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              rows={3}
              className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
            />
          </Campo>

          {error && <p className="text-xs text-danger">{error}</p>}

          <button
            onClick={crear}
            disabled={!puedeEnviar}
            className="ease-spring w-full rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-40"
          >
            {enviando ? "Creando…" : "Crear cliente"}
          </button>
        </div>
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
