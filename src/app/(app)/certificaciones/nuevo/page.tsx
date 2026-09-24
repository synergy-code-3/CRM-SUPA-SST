"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, LoaderCircle, ShieldAlert, Ticket } from "lucide-react";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";
import { REGIONES_CERTIFICACION, REGION_CERTIFICACION_LABEL, type RegionCertificacion } from "@/lib/certificaciones-tipos";
import { CERTIFICACION_LEGENDAR_IA, beneficiosDeRegion } from "@/components/certificaciones/constantes";

const INPUT =
  "w-full rounded-2xl border border-silver-deep/60 bg-surface-2 px-4 py-3 text-sm text-foreground outline-none transition-all duration-500 ease-spring placeholder:text-muted/60 focus:border-primary/50 focus:ring-4 focus:ring-primary/10";

export default function NuevoClienteCertificacionPage() {
  const router = useRouter();
  const { usuario, cargando } = useSesion();
  const puedeGestionar = !!usuario && tienePermiso(usuario.rol, "gestionarCertificaciones");
  const [form, setForm] = useState({
    nombre: "",
    email: "",
    telefono: "",
    vendedor: "",
    region: "" as RegionCertificacion | "",
    monto: "",
    notas: "",
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeEnviar = form.nombre.trim() && form.email.trim() && !enviando;
  const beneficios = beneficiosDeRegion(form.region || null);

  async function crear() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/certificaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, etiquetas: [CERTIFICACION_LEGENDAR_IA] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          /duplicate|already exists|unique/i.test(data.error ?? "")
            ? "Ya existe un cliente con ese correo."
            : (data.error ?? "No se pudo crear el cliente")
        );
        return;
      }
      router.push(`/certificaciones?id=${encodeURIComponent(data.cliente.id)}`);
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) return <div className="py-16 text-center text-sm text-muted">Cargando…</div>;

  if (!puedeGestionar) {
    return (
      <div className="shell rounded-[2rem] p-2 diffused-lg">
        <div className="core flex flex-col items-center gap-3 rounded-[calc(2rem-0.5rem)] p-16 text-center">
          <ShieldAlert className="h-6 w-6 text-muted" strokeWidth={1.5} />
          <p className="text-sm text-muted">Solo un administrador puede registrar clientes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="inline-block w-fit rounded-full bg-primary-dim px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-primary-deep">
          Alta manual
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Registrar nuevo cliente</h1>
        <p className="text-sm text-muted">Alta directa, sin pasar por ningún pipeline de seguimiento.</p>
      </div>

      <div className="shell rounded-[2rem] p-2 diffused-lg">
        <div className="core flex flex-col gap-5 rounded-[calc(2rem-0.5rem)] p-8">
          <Campo label="Nombre completo *">
            <input
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              className={INPUT}
            />
          </Campo>
          <Campo label="Correo *">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className={INPUT}
            />
          </Campo>
          <Campo label="Teléfono">
            <input
              value={form.telefono}
              onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
              className={INPUT}
            />
          </Campo>
          <Campo label="Vendedor">
            <input
              value={form.vendedor}
              onChange={(e) => setForm((f) => ({ ...f, vendedor: e.target.value }))}
              placeholder="Nombre del vendedor (opcional)"
              className={INPUT}
            />
          </Campo>

          <div>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">Región</span>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 p-1">
              {REGIONES_CERTIFICACION.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, region: f.region === r ? "" : r }))}
                  className={`rounded-xl py-2.5 text-sm font-medium transition-all duration-500 ease-spring ${
                    form.region === r
                      ? "bg-surface text-primary shadow-[0_6px_16px_-6px_rgba(10,92,255,0.35)]"
                      : "text-muted"
                  }`}
                >
                  {REGION_CERTIFICACION_LABEL[r]}
                </button>
              ))}
            </div>
          </div>

          {beneficios.length > 0 && (
            <div className="rounded-2xl bg-primary-dim p-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-primary-deep">
                <Ticket className="h-3.5 w-3.5" strokeWidth={1.5} />
                Beneficios Synergy Unlimited
              </p>
              <ul className="flex flex-col gap-1 text-sm text-primary-deep">
                {beneficios.map((b) => (
                  <li key={`${b.evento}-${b.tipo}`} className="flex justify-between">
                    <span>{b.evento}</span>
                    <span>
                      {b.cantidad}x {b.tipo}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Campo label="Monto pagado">
            <input
              value={form.monto}
              onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
              placeholder="Ej. $3,997 MXN"
              className={INPUT}
            />
          </Campo>
          <Campo label="Notas">
            <textarea
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              rows={3}
              className={`${INPUT} resize-none`}
            />
          </Campo>

          {error && <p className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}

          <button
            onClick={crear}
            disabled={!puedeEnviar}
            className="group flex w-full items-center justify-between rounded-full bg-primary py-1 pl-6 pr-1 text-sm font-medium text-white shadow-[0_10px_30px_-8px_rgba(10,92,255,0.55)] transition-all duration-500 ease-spring hover:shadow-[0_14px_36px_-6px_rgba(10,92,255,0.6)] active:scale-[0.98] disabled:opacity-50"
          >
            <span className="py-2.5">{enviando ? "Creando…" : "Registrar cliente"}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 ease-spring group-hover:translate-x-1">
              {enviando ? (
                <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={1.75} />
              ) : (
                <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
              )}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">{label}</span>
      {children}
    </label>
  );
}
