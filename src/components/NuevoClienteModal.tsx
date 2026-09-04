"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { PAISES_AMERICA } from "@/lib/paises-america";
import { ComboboxBuscador } from "./ComboboxBuscador";
import type { Cliente } from "@/lib/types";

const OPCIONES_PAIS = PAISES_AMERICA.map((p) => ({ valor: p.nombre, etiqueta: p.nombre, nota: p.lada }));
const OPCIONES_MEMBRESIA = ["3 Meses", "6 Meses", "12 Meses"].map((m) => ({ valor: m, etiqueta: m }));

// Cuando el correo ya tiene algún estado previo que "Nuevo cliente" no
// debe pisar a ciegas — ver verificarPreAlta() en src/lib/alta-cliente.ts.
type Colision =
  | { tipo: "ya_activo"; clienteId: string }
  | { tipo: "ya_inactivo"; clienteId: string };

export function NuevoClienteModal({
  onClose,
  onCreado,
  onVerClienteExistente,
}: {
  onClose: () => void;
  onCreado: (cliente: Cliente) => void;
  // Abre el perfil del cliente que ya existe (ya_activo/ya_inactivo) —
  // mismo mecanismo que ya usa ClientesPage para abrir cualquier fila.
  onVerClienteExistente: (id: string) => void;
}) {
  const [form, setForm] = useState({
    nombre: "",
    email: "",
    telefono: "",
    pais: "",
    evento: "",
    tipoMembresia: "",
    etiqueta: "",
    ofertaAdicionalId: "",
  });
  const [eventos, setEventos] = useState<{ valor: string; etiqueta: string }[]>([]);
  const [etiquetas, setEtiquetas] = useState<{ valor: string; etiqueta: string }[]>([]);
  const [ofertasKajabi, setOfertasKajabi] = useState<{ valor: string; etiqueta: string }[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colision, setColision] = useState<Colision | null>(null);

  useEffect(() => {
    fetch("/api/biblioteca?tipo=evento")
      .then((r) => r.json())
      .then((data) => setEventos((data.opciones ?? []).map((v: string) => ({ valor: v, etiqueta: v }))))
      .catch(() => setEventos([]));
    fetch("/api/biblioteca?tipo=etiqueta")
      .then((r) => r.json())
      .then((data) => setEtiquetas((data.opciones ?? []).map((v: string) => ({ valor: v, etiqueta: v }))))
      .catch(() => setEtiquetas([]));
    fetch("/api/kajabi/ofertas")
      .then((r) => r.json())
      .then((data) => {
        const ofertas: { id: string; titulo: string }[] = data.ofertas ?? [];
        setOfertasKajabi(ofertas.map((o) => ({ valor: o.id, etiqueta: o.titulo })));
      })
      .catch(() => setOfertasKajabi([]));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onCambiarPais(pais: string) {
    const lada = PAISES_AMERICA.find((p) => p.nombre === pais)?.lada ?? "";
    setForm((f) => ({
      ...f,
      pais,
      // Solo antepone la lada si el usuario todavía no había escrito nada,
      // para no pisarle un número que ya estaba tecleando.
      telefono: f.telefono.trim() ? f.telefono : lada ? `${lada} ` : f.telefono,
    }));
  }

  async function crear(sobrescribir?: boolean) {
    setGuardando(true);
    setError(null);
    setColision(null);
    const ofertaAdicionalTitulo = ofertasKajabi.find((o) => o.valor === form.ofertaAdicionalId)?.etiqueta ?? "";
    const res = await fetch("/api/clientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        ofertaAdicionalTitulo: form.ofertaAdicionalId ? ofertaAdicionalTitulo : undefined,
        sobrescribir: sobrescribir || undefined,
      }),
    });
    const data = await res.json();
    setGuardando(false);
    if (!res.ok) {
      if (data.colision === "ya_activo" || data.colision === "ya_inactivo") {
        setColision({ tipo: data.colision, clienteId: data.clienteId });
        return;
      }
      if (data.colision === "kajabi_previo") {
        if (
          window.confirm(
            "Este contacto de Kajabi ya tenía la oferta otorgada de antes de este CRM (típico del error masivo previo). ¿Deseas revocarla y otorgarle la nueva de todos modos?"
          )
        ) {
          void crear(true);
          return;
        }
        setError("No se creó el cliente — se canceló al no confirmar la oferta de Kajabi.");
        return;
      }
      setError(data.error ?? "No se pudo crear el cliente");
      return;
    }
    const avisos: string[] = [];
    if (data.avisoKajabi) avisos.push(`Kajabi: ${data.avisoKajabi}`);
    if (data.avisoSkool) avisos.push(`Skool: ${data.avisoSkool}`);
    if (data.avisoGhl) avisos.push(`GoHighLevel: ${data.avisoGhl}`);
    if (data.avisoOfertaAdicional) avisos.push(`Oferta adicional: ${data.avisoOfertaAdicional}`);
    if (avisos.length) {
      window.alert(`Cliente creado, pero hubo problemas:\n\n${avisos.join("\n")}`);
    }
    onCreado(data.cliente);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-foreground/30 p-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="shell w-full max-w-md rounded-[2rem] p-2 diffused-lg animate-fade-in">
        <div className="core rounded-[calc(2rem-0.5rem)] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Nuevo cliente</h2>
            <button
              onClick={onClose}
              className="ease-spring rounded-full p-1.5 text-muted transition hover:bg-surface-2"
            >
              <X className="h-4.5 w-4.5" strokeWidth={1.75} />
            </button>
          </div>

          <div className="space-y-3">
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
            <div className="grid grid-cols-2 gap-2">
              <Campo label="País">
                <ComboboxBuscador
                  opciones={OPCIONES_PAIS}
                  valor={form.pais}
                  onChange={onCambiarPais}
                  placeholder="Seleccionar país…"
                />
              </Campo>
              <Campo label="Teléfono">
                <input
                  value={form.telefono}
                  onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                  className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
                />
              </Campo>
            </div>
            <Campo label="Evento">
              <ComboboxBuscador
                opciones={eventos}
                valor={form.evento}
                onChange={(evento) => setForm((f) => ({ ...f, evento }))}
                placeholder="Seleccionar evento…"
              />
            </Campo>
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Tipo de membresía">
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
            <Campo label="Oferta adicional (opcional)">
              <ComboboxBuscador
                opciones={ofertasKajabi}
                valor={form.ofertaAdicionalId}
                onChange={(ofertaAdicionalId) => setForm((f) => ({ ...f, ofertaAdicionalId }))}
                placeholder="Ninguna, solo el Club…"
                etiquetaVacio="— Ninguna —"
              />
            </Campo>
            <p className="text-xs text-muted">
              Al crear el cliente se le otorga automáticamente el acceso en Kajabi (oferta &quot;Club
              Sinergético&quot;, con correo de bienvenida), se le envía la invitación a la comunidad de
              Skool, y se le manda el mensaje de bienvenida por WhatsApp.
            </p>
          </div>

          {colision && (
            <div className="mt-3 rounded-xl border border-warning/30 bg-warning/10 p-3">
              <p className="text-xs text-foreground">
                Este correo ya es cliente del CRM y está{" "}
                <strong>{colision.tipo === "ya_activo" ? "activo" : "inactivo"}</strong> — ve a su perfil para
                hacer cambios ahí, no se puede volver a dar de alta.
              </p>
              <button
                onClick={() => onVerClienteExistente(colision.clienteId)}
                className="ease-spring mt-2 text-xs font-medium text-primary transition hover:text-primary-deep"
              >
                Ver perfil →
              </button>
            </div>
          )}
          {error && <p className="mt-3 text-xs text-danger">{error}</p>}

          <button
            onClick={() => crear()}
            disabled={guardando || !form.nombre.trim() || !form.email.trim()}
            className="ease-spring mt-5 w-full rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-40"
          >
            {guardando ? "Creando…" : "Crear cliente"}
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
