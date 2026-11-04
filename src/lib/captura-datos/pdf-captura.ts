// Informe imprimible del detalle de captura de una persona: se abre en una pestaña y el navegador lo guarda como PDF
// ("Guardar como PDF" en el cuadro de impresión). Sin dependencias; todo texto se escapa antes de entrar al HTML.
import { duracionLegible, estadisticasDeCaptura, fechaHoraCompleta, SEGUNDOS_CAPTURA_RAPIDA, type HojaDeCaptura } from "./historial";

export interface DatosInforme {
  usuario: string;
  evento: string;
  periodo: string;
  hojas: HojaDeCaptura[];
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ESCAPES[c]);
const seg = (s: number | null) => (s === null ? "—" : duracionLegible(s));

function filaHtml(h: HojaDeCaptura): string {
  const alertas = [h.rapida ? "Muy rápida" : "", h.sinCambios ? "Sin cambios" : "", h.segundos === null ? "Sin medición" : ""].filter(Boolean).join(", ");
  return `<tr class="${h.rapida || h.sinCambios ? "alerta" : ""}"><td>${esc(h.foto ?? "No disponible")}</td><td>${esc(h.folio || "—")}</td><td>${h.inicio ? esc(fechaHoraCompleta(h.inicio)) : "—"}</td><td>${esc(fechaHoraCompleta(h.fin))}</td><td>${seg(h.segundos)}</td><td>${h.guardados ?? "—"}</td><td>${seg(h.desdeAnteriorSegundos)}</td><td>${esc(alertas)}</td></tr>`;
}

export function htmlInforme(d: DatosInforme): string {
  const e = estadisticasDeCaptura(d.hojas);
  const rapidas = d.hojas.filter((h) => h.rapida).length;
  const sinCambios = d.hojas.filter((h) => h.sinCambios).length;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte de captura - ${esc(d.usuario)}</title><style>
body{font-family:system-ui,sans-serif;font-size:11px;color:#111;margin:24px}h1{font-size:18px;margin:0 0 4px}p{margin:2px 0}
table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f0f0f0}
tr.alerta td{background:#fff3e0}@media print{@page{size:landscape;margin:12mm}}</style></head><body>
<h1>Reporte de captura: ${esc(d.usuario)}</h1>
<p>Evento: ${esc(d.evento)} · Periodo: ${esc(d.periodo)}</p>
<p>Hojas: ${d.hojas.length} · Medidas: ${e.medidas} · Mínimo ${seg(e.minimo)} · Mediana ${seg(e.mediana)} · Máximo ${seg(e.maximo)}</p>
<p>Muy rápidas (menos de ${SEGUNDOS_CAPTURA_RAPIDA} s): ${rapidas} · Sin cambios guardados: ${sinCambios}</p>
<table><thead><tr><th>Foto</th><th>Folio</th><th>Inició</th><th>Terminó</th><th>Duración</th><th>Guardados</th><th>Desde la anterior</th><th>Alertas</th></tr></thead><tbody>${d.hojas.map(filaHtml).join("")}</tbody></table>
</body></html>`;
}

/** Abre el informe en una pestaña nueva y lanza la impresión. Devuelve false si el navegador bloqueó la ventana. */
export function imprimirInforme(d: DatosInforme): boolean {
  const ventana = window.open("", "_blank");
  if (!ventana) return false;
  ventana.document.write(htmlInforme(d));
  ventana.document.close();
  ventana.focus();
  ventana.print();
  return true;
}
