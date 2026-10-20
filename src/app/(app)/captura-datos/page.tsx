import { ClipboardList } from "lucide-react";

// Placeholder para admin mientras se define qué va en esta subplataforma —
// coordinador/abeja ni siquiera llegan aquí (ver layout.tsx, los detiene
// antes con "En construcción"). Reemplazar este contenido es la señal de
// que ya se empezó a construir de verdad.
export default function CapturaDatosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Captura de Datos</h1>
        <p className="text-sm text-muted">Nueva subplataforma — todavía en preparación.</p>
      </div>

      <div className="shell rounded-[1.75rem] p-2 diffused">
        <div className="core flex flex-col items-center gap-2 rounded-[calc(1.75rem-0.5rem)] px-6 py-16 text-center">
          <ClipboardList className="h-8 w-8 text-muted" strokeWidth={1.5} />
          <h2 className="text-base font-medium text-foreground">Aún no hay nada que mostrar aquí</h2>
          <p className="text-sm text-muted">El espacio ya está listo (permisos, menú, ruta) — falta definir qué captura esta sección.</p>
        </div>
      </div>
    </div>
  );
}
