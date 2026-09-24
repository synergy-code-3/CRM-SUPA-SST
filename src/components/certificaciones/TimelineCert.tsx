import {
  UserPlus,
  Send,
  CheckCircle2,
  RefreshCcw,
  XCircle,
  StickyNote,
  Trash2,
  UploadCloud,
  MessageCircle,
  Undo2,
  Pause,
  Play,
  CalendarPlus,
  Tag,
  UserCheck,
  Layers,
  Pencil,
  Recycle,
  RotateCcw,
  DollarSign,
} from "lucide-react";
import type { EventoCertificacion } from "@/lib/certificaciones-tipos";
import { EVENTO_LABEL } from "./constantes";

const ICONS: Record<string, typeof UserPlus> = {
  LLEGADA: UserPlus,
  INVITACION_ENVIADA: Send,
  INVITACION_ACEPTADA: CheckCircle2,
  RENOVACION: RefreshCcw,
  VENCIMIENTO: XCircle,
  NOTA: StickyNote,
  ELIMINACION: Trash2,
  IMPORTACION: UploadCloud,
  MENSAJE_BIENVENIDA: MessageCircle,
  RESTAURACION: Undo2,
  PAUSA: Pause,
  REANUDACION: Play,
  EXTENSION: CalendarPlus,
  TAGS: Tag,
  VENDEDOR: UserCheck,
  ETIQUETAS: Layers,
  EDICION: Pencil,
  PAPELERA: Recycle,
  RESTAURACION_PAPELERA: RotateCcw,
  ELIMINACION_PERMANENTE: Trash2,
  ABONO: DollarSign,
};

// Línea de tiempo del CRM original: nodos con ring azul sobre una línea
// vertical, más reciente arriba.
export function TimelineCert({ eventos }: { eventos: EventoCertificacion[] }) {
  const ordenados = [...eventos].sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime());
  return (
    <div>
      <h3 className="mb-6 text-sm font-medium uppercase tracking-[0.15em] text-muted">Línea de tiempo</h3>
      {ordenados.length === 0 ? (
        <p className="text-sm text-muted">Sin eventos todavía.</p>
      ) : (
        <ol className="relative flex flex-col gap-6 pl-2">
          <div className="absolute bottom-2 left-[19px] top-2 w-px bg-silver" />
          {ordenados.map((evento) => {
            const Icon = ICONS[evento.tipo] ?? StickyNote;
            return (
              <li key={evento.id} className="relative flex gap-4">
                <div className="relative z-10 flex h-9 w-9 flex-none items-center justify-center rounded-full bg-surface ring-4 ring-primary-dim">
                  <Icon className="h-4 w-4 text-primary" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1 pb-1 pt-1">
                  <p className="text-sm font-medium text-foreground">{EVENTO_LABEL[evento.tipo] ?? evento.tipo}</p>
                  {evento.nota && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted">{evento.nota}</p>}
                  <p className="mt-1 text-xs text-muted/70">
                    {new Date(evento.creadoEn).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
                    {evento.autor && ` · ${evento.autor}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
