"use client";

import { useState } from "react";
import { Plus, Trash2, ImagePlus } from "lucide-react";
import { ComboboxBuscador } from "@/components/ComboboxBuscador";
import type { Plataforma } from "@/components/community-manager/mock-data";

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
};

function filaVacia(id: number): FilaComentario {
  return { id, usuario: "", comentario: "", accion: "Sin acción", motivo: "—" };
}

// Formulario de "Registro de publicación" — una instancia por red (la
// navegación entre redes vive en el menú lateral, anidada bajo
// "Moderación", ver NAV_COMMUNITY_MANAGER en Sidebar.tsx).
export function ModeracionContenido({ plataforma }: { plataforma: Plataforma }) {
  const [enlace, setEnlace] = useState("");
  const [tipoPublicacion, setTipoPublicacion] = useState("");
  const [fechaRevision, setFechaRevision] = useState("");
  const [cantidadComentarios, setCantidadComentarios] = useState("");
  const [cantidadInteracciones, setCantidadInteracciones] = useState("");
  const [esPauta, setEsPauta] = useState("");
  const [comentarios, setComentarios] = useState<FilaComentario[]>([filaVacia(1), filaVacia(2)]);
  const [siguienteId, setSiguienteId] = useState(3);
  const [notas, setNotas] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  function actualizarComentario(id: number, cambios: Partial<FilaComentario>) {
    setComentarios((filas) => filas.map((f) => (f.id === id ? { ...f, ...cambios } : f)));
  }

  function agregarComentario() {
    setComentarios((filas) => [...filas, filaVacia(siguienteId)]);
    setSiguienteId((n) => n + 1);
  }

  function quitarComentario(id: number) {
    setComentarios((filas) => filas.filter((f) => f.id !== id));
  }

  function guardarRegistro() {
    // Solo visual por ahora — la funcionalidad real (guardar en Supabase y
    // reflejarlo en Estadísticas) se conecta en una siguiente fase.
    setAviso("Esta es la vista previa visual — todavía no se conecta a la base de datos.");
    setTimeout(() => setAviso(null), 4000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Moderación <span className="text-muted">· {TITULO_PLATAFORMA[plataforma]}</span>
        </h1>
        <p className="text-sm text-muted">Registra una publicación que revisaste en {TITULO_PLATAFORMA[plataforma]}.</p>
      </div>

      <div className="shell rounded-[1.75rem] p-2 diffused">
        <div className="core space-y-5 rounded-[calc(1.75rem-0.5rem)] p-5">
          <h3 className="text-sm font-semibold text-foreground">Información de la publicación</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Enlace de la publicación *">
              <input
                value={enlace}
                onChange={(e) => setEnlace(e.target.value)}
                placeholder={`https://www.${DOMINIO_PLATAFORMA[plataforma]}/...`}
                className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
              />
            </Campo>
            <Campo label="Tipo de publicación *">
              <ComboboxBuscador opciones={OPCIONES_TIPO_PUBLICACION} valor={tipoPublicacion} onChange={setTipoPublicacion} placeholder="Seleccionar…" />
            </Campo>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Campo label="Fecha de revisión *">
              <input
                type="date"
                value={fechaRevision}
                onChange={(e) => setFechaRevision(e.target.value)}
                className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
              />
            </Campo>
            <Campo label="Cantidad de comentarios *">
              <input
                type="number"
                min={0}
                value={cantidadComentarios}
                onChange={(e) => setCantidadComentarios(e.target.value)}
                className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
              />
            </Campo>
            <Campo label="Cantidad de interacciones *">
              <input
                type="number"
                min={0}
                value={cantidadInteracciones}
                onChange={(e) => setCantidadInteracciones(e.target.value)}
                className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
              />
            </Campo>
          </div>
          <div className="max-w-xs">
            <Campo label="¿Es pauta? *">
              <ComboboxBuscador opciones={OPCIONES_SI_NO} valor={esPauta} onChange={setEsPauta} placeholder="Seleccionar…" />
            </Campo>
          </div>
        </div>
      </div>

      <div className="shell rounded-[1.75rem] p-2 diffused">
        <div className="core rounded-[calc(1.75rem-0.5rem)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Comentarios de la publicación</h3>
            <button
              onClick={agregarComentario}
              className="ease-spring flex items-center gap-1.5 rounded-lg brand-plate px-3 py-1.5 text-xs font-medium text-white transition"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              Agregar comentario
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-silver text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="w-8 py-2 pr-2">#</th>
                  <th className="py-2 pr-3">Usuario</th>
                  <th className="py-2 pr-3">Comentario</th>
                  <th className="py-2 pr-3">Acción</th>
                  <th className="py-2 pr-3">Motivo</th>
                  <th className="py-2 pr-3">Captura</th>
                  <th className="w-8 py-2" />
                </tr>
              </thead>
              <tbody>
                {comentarios.map((fila, i) => (
                  <tr key={fila.id} className="border-b border-silver/60 last:border-0">
                    <td className="py-2 pr-2 text-muted">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <input
                        value={fila.usuario}
                        onChange={(e) => actualizarComentario(fila.id, { usuario: e.target.value })}
                        placeholder="Usuario"
                        className="w-28 rounded-lg border border-silver bg-surface-2 px-2 py-1 text-xs outline-none ring-primary/30 focus:ring-2"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        value={fila.comentario}
                        onChange={(e) => actualizarComentario(fila.id, { comentario: e.target.value })}
                        placeholder="Comentario"
                        className="w-56 rounded-lg border border-silver bg-surface-2 px-2 py-1 text-xs outline-none ring-primary/30 focus:ring-2"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <ComboboxBuscador
                        opciones={OPCIONES_ACCION}
                        valor={fila.accion}
                        onChange={(v) => actualizarComentario(fila.id, { accion: v })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <ComboboxBuscador
                        opciones={OPCIONES_MOTIVO}
                        valor={fila.motivo}
                        onChange={(v) => actualizarComentario(fila.id, { motivo: v })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <button
                        title="Adjuntar captura (opcional)"
                        className="ease-spring flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-silver text-muted transition hover:border-primary/40 hover:text-primary"
                      >
                        <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => quitarComentario(fila.id)}
                        title="Quitar fila"
                        className="ease-spring flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
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
        <div className="core rounded-[calc(1.75rem-0.5rem)] p-5">
          <Campo label="Notas adicionales (opcional)">
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones sobre la publicación…"
              rows={3}
              className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
            />
          </Campo>
          {aviso && <p className="mt-3 text-xs text-warning">{aviso}</p>}
          <button
            onClick={guardarRegistro}
            className="ease-spring mt-4 w-full rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition sm:w-auto"
          >
            Guardar registro
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
