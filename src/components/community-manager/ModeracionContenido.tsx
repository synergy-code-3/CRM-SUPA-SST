"use client";

import { useRef, useState } from "react";
import { Plus, Trash2, ImagePlus, Check } from "lucide-react";
import { ComboboxBuscador } from "@/components/ComboboxBuscador";
import type { Plataforma } from "@/lib/community-manager";

const TITULO_PLATAFORMA: Record<Plataforma, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  skool: "Skool",
};

const DOMINIO_PLATAFORMA: Record<Plataforma, string> = {
  facebook: "facebook.com",
  instagram: "instagram.com",
  tiktok: "tiktok.com",
  skool: "skool.com",
};

const OPCIONES_TIPO_PUBLICACION = ["Publicación normal", "Reel / Video corto", "Historia", "Live", "Anuncio pagado"].map((v) => ({
  valor: v,
  etiqueta: v,
}));
const OPCIONES_SI_NO = ["Sí", "No"].map((v) => ({ valor: v, etiqueta: v }));
const OPCIONES_ACCION = ["Sin acción", "Eliminado"].map((v) => ({ valor: v, etiqueta: v }));
const OPCIONES_MOTIVO = ["—", "Spam", "Ofensas", "Ventas no autorizadas", "Información falsa", "Otros"].map((v) => ({
  valor: v,
  etiqueta: v,
}));

type FilaComentario = {
  id: number;
  usuario: string;
  comentario: string;
  accion: string;
  motivo: string;
  archivoCaptura: File | null;
};

function filaVacia(id: number): FilaComentario {
  return { id, usuario: "", comentario: "", accion: "Sin acción", motivo: "—", archivoCaptura: null };
}

function formularioVacio() {
  return {
    enlace: "",
    tipoPublicacion: "",
    fechaRevision: "",
    cantidadComentarios: "",
    cantidadBorrados: "",
    cantidadInteracciones: "",
    esPauta: "",
    notas: "",
  };
}

// Formulario de "Registro de publicación" — una instancia por red (la
// navegación entre redes vive en el menú lateral, anidada bajo
// "Moderación", ver NAV_COMMUNITY_MANAGER en Sidebar.tsx). Guarda de verdad
// en Supabase vía POST /api/community-manager/publicaciones — lo que se
// guarda aquí es lo que alimenta Estadísticas.
export function ModeracionContenido({ plataforma }: { plataforma: Plataforma }) {
  const [form, setForm] = useState(formularioVacio());
  const [comentarios, setComentarios] = useState<FilaComentario[]>([filaVacia(1), filaVacia(2)]);
  const siguienteId = useRef(3);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const inputsCaptura = useRef<Record<number, HTMLInputElement | null>>({});

  function actualizarComentario(id: number, cambios: Partial<FilaComentario>) {
    setComentarios((filas) => filas.map((f) => (f.id === id ? { ...f, ...cambios } : f)));
  }

  function agregarComentario() {
    setComentarios((filas) => [...filas, filaVacia(siguienteId.current++)]);
  }

  function quitarComentario(id: number) {
    setComentarios((filas) => (filas.length <= 1 ? filas : filas.filter((f) => f.id !== id)));
  }

  async function guardarRegistro() {
    setError(null);
    if (!form.enlace.trim() || !form.tipoPublicacion || !form.fechaRevision || !form.esPauta) {
      setError("Completa enlace, tipo de publicación, fecha de revisión y si es pauta.");
      return;
    }
    setGuardando(true);
    try {
      const id = crypto.randomUUID();

      // Las capturas se suben primero (usan el id que se le va a dar al
      // registro) — así la foto queda enlazada aunque se suban en pasos
      // separados.
      const comentariosConCaptura = await Promise.all(
        comentarios.map(async (c) => {
          if (!c.archivoCaptura) return { usuario: c.usuario, comentario: c.comentario, accion: c.accion, motivo: c.motivo, capturaUrl: null };
          const body = new FormData();
          body.set("publicacionId", id);
          body.set("archivo", c.archivoCaptura);
          const res = await fetch("/api/community-manager/capturas", { method: "POST", body });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "No se pudo subir una captura");
          return { usuario: c.usuario, comentario: c.comentario, accion: c.accion, motivo: c.motivo, capturaUrl: data.url as string };
        })
      );

      const res = await fetch("/api/community-manager/publicaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          plataforma,
          enlace: form.enlace,
          tipoPublicacion: form.tipoPublicacion,
          fechaRevision: form.fechaRevision,
          cantidadComentarios: form.cantidadComentarios,
          cantidadBorrados: form.cantidadBorrados,
          cantidadInteracciones: form.cantidadInteracciones,
          esPauta: form.esPauta,
          notas: form.notas,
          comentarios: comentariosConCaptura,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar el registro");

      setForm(formularioVacio());
      setComentarios([filaVacia(siguienteId.current++), filaVacia(siguienteId.current++)]);
      setExito(true);
      setTimeout(() => setExito(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el registro");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Moderación <span className="text-muted">· {TITULO_PLATAFORMA[plataforma]}</span>
        </h1>
        <p className="text-sm text-muted">Registra una publicación que revisaste en {TITULO_PLATAFORMA[plataforma]}.</p>
      </div>

      <div className="shell rounded-[1.75rem] p-2 diffused">
        <div className="core space-y-6 rounded-[calc(1.75rem-0.5rem)] p-6">
          <h3 className="text-base font-semibold text-foreground">Información de la publicación</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Enlace de la publicación *">
              <input
                value={form.enlace}
                onChange={(e) => setForm((f) => ({ ...f, enlace: e.target.value }))}
                placeholder={`https://www.${DOMINIO_PLATAFORMA[plataforma]}/...`}
                className="w-full rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
              />
            </Campo>
            <Campo label="Tipo de publicación *">
              <ComboboxBuscador opciones={OPCIONES_TIPO_PUBLICACION} valor={form.tipoPublicacion} onChange={(v) => setForm((f) => ({ ...f, tipoPublicacion: v }))} placeholder="Seleccionar…" />
            </Campo>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Campo label="Fecha de revisión *">
              <input
                type="date"
                value={form.fechaRevision}
                onChange={(e) => setForm((f) => ({ ...f, fechaRevision: e.target.value }))}
                className="w-full rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
              />
            </Campo>
            <Campo label="Cantidad de comentarios *">
              <input
                type="number"
                min={0}
                value={form.cantidadComentarios}
                onChange={(e) => setForm((f) => ({ ...f, cantidadComentarios: e.target.value }))}
                className="w-full rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
              />
            </Campo>
            <Campo label="Cantidad de comentarios eliminados *">
              <input
                type="number"
                min={0}
                value={form.cantidadBorrados}
                onChange={(e) => setForm((f) => ({ ...f, cantidadBorrados: e.target.value }))}
                className="w-full rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
              />
            </Campo>
            <Campo label="Cantidad de interacciones *">
              <input
                type="number"
                min={0}
                value={form.cantidadInteracciones}
                onChange={(e) => setForm((f) => ({ ...f, cantidadInteracciones: e.target.value }))}
                className="w-full rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
              />
            </Campo>
          </div>
          <div className="max-w-xs">
            <Campo label="¿Es pauta? *">
              <ComboboxBuscador opciones={OPCIONES_SI_NO} valor={form.esPauta} onChange={(v) => setForm((f) => ({ ...f, esPauta: v }))} placeholder="Seleccionar…" />
            </Campo>
          </div>
        </div>
      </div>

      <div className="shell rounded-[1.75rem] p-2 diffused">
        <div className="core rounded-[calc(1.75rem-0.5rem)] p-6">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">Comentarios de la publicación</h3>
            <button
              onClick={agregarComentario}
              className="ease-spring flex items-center gap-1.5 rounded-lg brand-plate px-3.5 py-2 text-sm font-medium text-white transition"
            >
              <Plus className="h-4 w-4" strokeWidth={1.75} />
              Agregar comentario
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-silver text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="w-8 py-2.5 pr-2">#</th>
                  <th className="py-2.5 pr-3">Usuario</th>
                  <th className="py-2.5 pr-3">Comentario</th>
                  <th className="py-2.5 pr-3">Acción</th>
                  <th className="py-2.5 pr-3">Motivo</th>
                  <th className="py-2.5 pr-3">Captura</th>
                  <th className="w-8 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {comentarios.map((fila, i) => (
                  <tr key={fila.id} className="border-b border-silver/60 last:border-0">
                    <td className="py-2.5 pr-2 text-muted">{i + 1}</td>
                    <td className="py-2.5 pr-3">
                      <input
                        value={fila.usuario}
                        onChange={(e) => actualizarComentario(fila.id, { usuario: e.target.value })}
                        placeholder="Usuario"
                        className="w-28 rounded-lg border border-silver bg-surface-2 px-2.5 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
                      />
                    </td>
                    <td className="py-2.5 pr-3">
                      <input
                        value={fila.comentario}
                        onChange={(e) => actualizarComentario(fila.id, { comentario: e.target.value })}
                        placeholder="Comentario"
                        className="w-60 rounded-lg border border-silver bg-surface-2 px-2.5 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
                      />
                    </td>
                    <td className="py-2.5 pr-3">
                      <ComboboxBuscador
                        opciones={OPCIONES_ACCION}
                        valor={fila.accion}
                        onChange={(v) => actualizarComentario(fila.id, { accion: v })}
                      />
                    </td>
                    <td className="py-2.5 pr-3">
                      <ComboboxBuscador
                        opciones={OPCIONES_MOTIVO}
                        valor={fila.motivo}
                        onChange={(v) => actualizarComentario(fila.id, { motivo: v })}
                      />
                    </td>
                    <td className="py-2.5 pr-3">
                      <input
                        ref={(el) => {
                          inputsCaptura.current[fila.id] = el;
                        }}
                        type="file"
                        accept="image/*"
                        onChange={(e) => actualizarComentario(fila.id, { archivoCaptura: e.target.files?.[0] ?? null })}
                        className="hidden"
                      />
                      <button
                        onClick={() => inputsCaptura.current[fila.id]?.click()}
                        title={fila.archivoCaptura ? fila.archivoCaptura.name : "Adjuntar captura (opcional)"}
                        className={`ease-spring flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                          fila.archivoCaptura
                            ? "border-success/40 bg-success/10 text-success"
                            : "border-dashed border-silver text-muted hover:border-primary/40 hover:text-primary"
                        }`}
                      >
                        {fila.archivoCaptura ? <Check className="h-4 w-4" strokeWidth={1.75} /> : <ImagePlus className="h-4 w-4" strokeWidth={1.75} />}
                      </button>
                    </td>
                    <td className="py-2.5">
                      <button
                        onClick={() => quitarComentario(fila.id)}
                        title="Quitar fila"
                        className="ease-spring flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="shell rounded-[1.75rem] p-2 diffused">
        <div className="core rounded-[calc(1.75rem-0.5rem)] p-6">
          <Campo label="Notas adicionales (opcional)">
            <textarea
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              placeholder="Observaciones sobre la publicación…"
              rows={3}
              className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
            />
          </Campo>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          {exito && <p className="mt-3 text-sm text-success">Registro guardado — ya se refleja en Estadísticas.</p>}
          <button
            onClick={guardarRegistro}
            disabled={guardando}
            className="ease-spring mt-5 w-full rounded-xl brand-plate px-4 py-3 text-sm font-medium text-white transition disabled:opacity-50 sm:w-auto"
          >
            {guardando ? "Guardando…" : "Guardar registro"}
          </button>
        </div>
      </div>
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
