"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import { Mail, Pause, Pencil, Phone, Play, RefreshCw, Send, Tag as TagIcon, Trash2, Award } from "lucide-react";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";
import type { AbonoCertificacion, ClienteCertificacion, EventoCertificacion } from "@/lib/certificaciones-tipos";
import { REGION_CERTIFICACION_LABEL, REGIONES_CERTIFICACION } from "@/lib/certificaciones-tipos";
import { ComboboxBuscador } from "@/components/ComboboxBuscador";

const OPCIONES_REGION = REGIONES_CERTIFICACION.map((r) => ({ valor: r, etiqueta: REGION_CERTIFICACION_LABEL[r] }));

type Respuesta = { cliente: ClienteCertificacion; eventos: EventoCertificacion[]; abonos: AbonoCertificacion[] };

export default function PerfilCertificacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const clienteId = decodeURIComponent(id);
  const { usuario } = useSesion();
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<{
    nombre: string;
    email: string;
    telefono: string;
    region: string;
    notas: string;
    monto: string;
  } | null>(null);
  const [notaNueva, setNotaNueva] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [abonoForm, setAbonoForm] = useState({ monto: "", moneda: "", nota: "" });

  const puedeGestionar = usuario ? tienePermiso(usuario.rol, "gestionarCertificaciones") : false;
  const puedeNotas = usuario ? tienePermiso(usuario.rol, "agregarNotaCertificaciones") : false;

  async function cargar() {
    const res = await fetch(`/api/certificaciones/${encodeURIComponent(clienteId)}`);
    if (!res.ok) return;
    const data: Respuesta = await res.json();
    setDatos(data);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  function abrirEdicion() {
    if (!datos) return;
    setForm({
      nombre: datos.cliente.nombre,
      email: datos.cliente.email ?? "",
      telefono: datos.cliente.telefono ?? "",
      region: datos.cliente.region ?? "",
      notas: datos.cliente.notas ?? "",
      monto: datos.cliente.monto ?? "",
    });
    setEditando(true);
  }

  async function guardarEdicion() {
    if (!form) return;
    setProcesando(true);
    try {
      const res = await fetch(`/api/certificaciones/${encodeURIComponent(clienteId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "No se pudo guardar");
        return;
      }
      setEditando(false);
      cargar();
    } finally {
      setProcesando(false);
    }
  }

  async function accion(ruta: string, body?: unknown) {
    setProcesando(true);
    try {
      const res = await fetch(`/api/certificaciones/${encodeURIComponent(clienteId)}/${ruta}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "No se pudo completar la acción");
        return;
      }
      if (data.avisoSkool) alert(`Invitación registrada, pero hubo un problema con Skool:\n\n${data.avisoSkool}`);
      cargar();
    } finally {
      setProcesando(false);
    }
  }

  async function enviarNota() {
    if (!notaNueva.trim()) return;
    setProcesando(true);
    try {
      const res = await fetch(`/api/certificaciones/${encodeURIComponent(clienteId)}/nota`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nota: notaNueva }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "No se pudo agregar la nota");
        return;
      }
      setNotaNueva("");
      cargar();
    } finally {
      setProcesando(false);
    }
  }

  async function enviarAbono() {
    const monto = Number(abonoForm.monto);
    if (!Number.isFinite(monto) || monto === 0) return;
    setProcesando(true);
    try {
      const res = await fetch(`/api/certificaciones/${encodeURIComponent(clienteId)}/abono`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(abonoForm),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "No se pudo registrar el abono");
        return;
      }
      setAbonoForm({ monto: "", moneda: "", nota: "" });
      cargar();
    } finally {
      setProcesando(false);
    }
  }

  async function eliminar() {
    if (!confirm("¿Enviar este cliente a la papelera?")) return;
    setProcesando(true);
    try {
      const res = await fetch(`/api/certificaciones/${encodeURIComponent(clienteId)}/eliminar`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "No se pudo eliminar");
        return;
      }
      window.location.href = "/certificaciones";
    } finally {
      setProcesando(false);
    }
  }

  if (!datos) return <p className="text-sm text-muted">Cargando…</p>;
  const { cliente, eventos, abonos } = datos;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/certificaciones" className="text-xs text-primary hover:underline">
          ← Certificaciones
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{cliente.nombre}</h1>
            <p className="text-sm text-muted">
              {cliente.region ? REGION_CERTIFICACION_LABEL[cliente.region] : "Sin región"} · {cliente.estado}
              {cliente.pausada ? " · Pausada" : ""}
            </p>
          </div>
          {puedeGestionar && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={abrirEdicion}
                disabled={procesando}
                className="ease-spring flex items-center gap-1.5 rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-40"
              >
                <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                Editar
              </button>
              {cliente.estado === "NUEVO" && (
                <button
                  onClick={() => accion("invitar")}
                  disabled={procesando}
                  className="ease-spring flex items-center gap-1.5 rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-40"
                >
                  <Send className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Invitar
                </button>
              )}
              {cliente.pausada ? (
                <button
                  onClick={() => accion("reanudar")}
                  disabled={procesando}
                  className="ease-spring flex items-center gap-1.5 rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-40"
                >
                  <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Reanudar
                </button>
              ) : (
                <button
                  onClick={() => accion("pausar")}
                  disabled={procesando}
                  className="ease-spring flex items-center gap-1.5 rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-40"
                >
                  <Pause className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Pausar
                </button>
              )}
              <button
                onClick={() => accion("renovar")}
                disabled={procesando}
                className="ease-spring flex items-center gap-1.5 rounded-lg bg-success/15 px-3 py-1.5 text-xs font-medium text-success transition hover:bg-success/25 disabled:opacity-40"
              >
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                Renovar
              </button>
              <button
                onClick={eliminar}
                disabled={procesando}
                className="ease-spring flex items-center gap-1.5 rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                Papelera
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Seccion titulo="Datos">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
              <Dato icon={Mail} label="Correo" valor={cliente.email} />
              <Dato icon={Phone} label="Teléfono" valor={cliente.telefono} />
              <Dato label="Vencimiento" valor={cliente.fechaVencimiento ? new Date(cliente.fechaVencimiento).toLocaleDateString("es-MX") : null} />
              <Dato label="Monto" valor={cliente.monto} />
              <Dato label="Vendedor" valor={cliente.vendedor} />
            </div>
            {cliente.notas && <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{cliente.notas}</p>}
          </Seccion>

          <Seccion titulo="Línea de tiempo">
            <div className="space-y-3">
              {eventos.length === 0 && <p className="text-sm text-muted">Sin actividad todavía.</p>}
              {[...eventos].reverse().map((e) => (
                <div key={e.id} className="border-l-2 border-silver pl-3 text-sm">
                  <p className="font-medium text-foreground">{e.tipo}</p>
                  {e.nota && <p className="text-muted">{e.nota}</p>}
                  <p className="text-xs text-muted">
                    {e.autor} · {new Date(e.creadoEn).toLocaleString("es-MX")}
                  </p>
                </div>
              ))}
            </div>
            {puedeNotas && (
              <div className="mt-4 flex gap-2">
                <input
                  value={notaNueva}
                  onChange={(e) => setNotaNueva(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && enviarNota()}
                  placeholder="Agregar nota…"
                  className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
                />
                <button
                  onClick={enviarNota}
                  disabled={procesando || !notaNueva.trim()}
                  className="ease-spring flex-none rounded-lg brand-plate px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-40"
                >
                  Agregar
                </button>
              </div>
            )}
          </Seccion>
        </div>

        <div className="space-y-6">
          <Seccion titulo="Certificaciones y tags">
            <ChipsEditable
              icon={Award}
              etiquetas={cliente.etiquetas}
              puedeEditar={puedeGestionar}
              onQuitar={(v) => accionEtiqueta("etiquetas", v)}
            />
            <div className="mt-3">
              <ChipsEditable
                icon={TagIcon}
                etiquetas={cliente.tags}
                puedeEditar={puedeGestionar}
                onQuitar={(v) => accionEtiqueta("tags", v)}
              />
            </div>
          </Seccion>

          {puedeGestionar && (
            <Seccion titulo="Registrar abono">
              <div className="space-y-2">
                <input
                  value={abonoForm.monto}
                  onChange={(e) => setAbonoForm((f) => ({ ...f, monto: e.target.value }))}
                  placeholder="Monto"
                  className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
                />
                <input
                  value={abonoForm.moneda}
                  onChange={(e) => setAbonoForm((f) => ({ ...f, moneda: e.target.value }))}
                  placeholder="Moneda (ej. MXN)"
                  className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
                />
                <input
                  value={abonoForm.nota}
                  onChange={(e) => setAbonoForm((f) => ({ ...f, nota: e.target.value }))}
                  placeholder="Nota (opcional)"
                  className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
                />
                <button
                  onClick={enviarAbono}
                  disabled={procesando}
                  className="ease-spring w-full rounded-lg brand-plate px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-40"
                >
                  Registrar
                </button>
              </div>
              <div className="mt-3 space-y-1.5 text-sm">
                {abonos.length === 0 && <p className="text-muted">Sin abonos todavía.</p>}
                {abonos.map((a) => (
                  <p key={a.id} className="text-foreground">
                    {a.monto}
                    {a.moneda ? ` ${a.moneda}` : ""} — {new Date(a.creadoEn).toLocaleDateString("es-MX")}
                  </p>
                ))}
              </div>
            </Seccion>
          )}
        </div>
      </div>

      {editando && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-silver bg-surface p-5 shadow-xl">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Editar datos</h3>
            <div className="space-y-2.5">
              <Campo label="Nombre">
                <input
                  value={form.nombre}
                  onChange={(e) => setForm((f) => f && { ...f, nombre: e.target.value })}
                  className="w-full rounded-lg border border-silver bg-surface-2 px-2.5 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
                />
              </Campo>
              <Campo label="Correo">
                <input
                  value={form.email}
                  onChange={(e) => setForm((f) => f && { ...f, email: e.target.value })}
                  className="w-full rounded-lg border border-silver bg-surface-2 px-2.5 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
                />
              </Campo>
              <Campo label="Teléfono">
                <input
                  value={form.telefono}
                  onChange={(e) => setForm((f) => f && { ...f, telefono: e.target.value })}
                  className="w-full rounded-lg border border-silver bg-surface-2 px-2.5 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
                />
              </Campo>
              <Campo label="Región">
                <ComboboxBuscador
                  opciones={OPCIONES_REGION}
                  valor={form.region}
                  onChange={(region) => setForm((f) => f && { ...f, region })}
                  placeholder="Seleccionar…"
                />
              </Campo>
              <Campo label="Monto">
                <input
                  value={form.monto}
                  onChange={(e) => setForm((f) => f && { ...f, monto: e.target.value })}
                  className="w-full rounded-lg border border-silver bg-surface-2 px-2.5 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
                />
              </Campo>
              <Campo label="Notas">
                <textarea
                  value={form.notas}
                  onChange={(e) => setForm((f) => f && { ...f, notas: e.target.value })}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-2.5 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
                />
              </Campo>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setEditando(false)}
                className="ease-spring rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={guardarEdicion}
                disabled={procesando}
                className="ease-spring rounded-lg brand-plate px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  async function accionEtiqueta(tipo: "tags" | "etiquetas", valor: string) {
    const campo = tipo === "tags" ? "tag" : "etiqueta";
    await fetch(`/api/certificaciones/${encodeURIComponent(clienteId)}/${tipo}?${campo}=${encodeURIComponent(valor)}`, {
      method: "DELETE",
    });
    cargar();
  }
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="shell rounded-2xl p-2 diffused">
      <div className="core rounded-[calc(1rem-0.5rem)] p-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

function Dato({ icon: Icon, label, valor }: { icon?: typeof Mail; label: string; valor: string | null | undefined }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />}
        {label}
      </p>
      <p className="text-foreground">{valor?.trim() ? valor : "—"}</p>
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

function ChipsEditable({
  icon: Icon,
  etiquetas,
  puedeEditar,
  onQuitar,
}: {
  icon: typeof Award;
  etiquetas: string[];
  puedeEditar: boolean;
  onQuitar: (valor: string) => void;
}) {
  if (etiquetas.length === 0) return <p className="text-sm text-muted">Ninguna todavía.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {etiquetas.map((e) => (
        <span
          key={e}
          className="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-foreground"
        >
          <Icon className="h-3 w-3" strokeWidth={1.75} />
          {e}
          {puedeEditar && (
            <button onClick={() => onQuitar(e)} className="ml-1 text-muted hover:text-danger">
              ×
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
