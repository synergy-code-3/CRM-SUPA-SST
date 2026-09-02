// "Vencimiento Skool" viene como texto libre D/M/YYYY (día/mes sin ceros).
export function parsearFechaSkool(v: string | null | undefined): Date | null {
  if (!v) return null;
  const partes = v.split("/");
  if (partes.length !== 3) return null;
  const [d, m, y] = partes.map(Number);
  if (!d || !m || !y) return null;
  const fecha = new Date(y, m - 1, d);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export function formatearFechaSkool(fecha: Date): string {
  return `${fecha.getDate()}/${fecha.getMonth() + 1}/${fecha.getFullYear()}`;
}

// "Fin de acceso" nunca se guarda como un dato independiente que se pueda
// desincronizar del resto — siempre se calcula a partir de
// fecha_renovación (si el cliente ya renovó con el botón "Renovar" de este
// CRM) o, si no, de fecha_inscripción — que para los clientes cargados
// antes de este CRM YA hace las veces de "última renovación": el flujo
// viejo (hoja de cálculo) sobrescribía esa fecha en cada renovación en vez
// de llevar un campo aparte, así que sigue siendo la referencia correcta
// para ellos. Siempre +1 año exacto, sin importar el tipo de membresía
// (3/6/12 meses) — esa duración solo aplica al acceso a Skool
// (calcularVencimientoSkool), no a esto.
export function finAccesoCalculado(fechaInscripcion: string | null, fechaRenovacion: string | null): Date | null {
  const ancla = fechaRenovacion || fechaInscripcion;
  if (!ancla) return null;
  const inicio = new Date(ancla);
  if (Number.isNaN(inicio.getTime())) return null;
  const fin = new Date(inicio);
  fin.setFullYear(fin.getFullYear() + 1);
  return fin;
}

// Nueva ancla al renovar (botón "Renovar" o recompra vía Hotmart): si la
// membresía TODAVÍA está activa (su fin calculado sigue en el futuro), la
// renovación debe EXTENDER esa fecha +1 año, no reiniciar el conteo desde
// hoy — la persona sigue teniendo el tiempo que ya había pagado, perderlo
// sería regalarle menos de lo que compró. Si ya venció, sí se reinicia
// desde hoy porque no hay nada que extender. No hace falta tocar
// finAccesoCalculado: esta ancla nueva (el fin actual, o "hoy") se guarda
// como fecha_renovacion, y la fórmula de siempre (ancla + 1 año) hace el
// resto — mismo criterio ya usado en reanudarMembresia (ancla "sintética").
export function anclaAlRenovar(fechaInscripcionActual: string | null, fechaRenovacionActual: string | null): string {
  const hoy = new Date();
  const finActual = finAccesoCalculado(fechaInscripcionActual, fechaRenovacionActual);
  if (finActual && finActual > hoy) return finActual.toISOString();
  return hoy.toISOString();
}

// "Fin de acceso" que se le muestra al equipo, ajustado por etiqueta (ver
// calcularAccesos en boletos.ts — mismas claves de etiqueta que ahí, para
// que la fecha mostrada sea consistente con los boletos que de verdad se le
// dieron):
//  - MÁS+ (incluye "MÁS+ USA"/"MAS"): vitalicio de verdad — no tiene caso
//    mostrar una fecha calculada que ya pasó cuando el cliente sigue
//    recibiendo su acceso igual.
//  - BLACK ACCESS: +1 año sobre la fecha calculada normal.
//  - Cualquier otra etiqueta (o ninguna): la fecha calculada normal, sin
//    ajuste.
//
// SOLO aplica cuando `etiquetaAsignadaEn` no es null — es decir, cuando la
// etiqueta se asignó por el flujo normal del CRM (crearCliente/
// actualizarDatosCliente) de aquí en adelante. Los clientes migrados desde
// el CSV (evento MÁS+/BLACK ACCESS movido a etiqueta el 2026-09-02) se
// quedan con etiquetaAsignadaEn en null a propósito: su fecha de
// inscripción ya venía ajustada a mano en la hoja de origen, así que no se
// les debe sumar el ajuste otra vez encima.
export type FinAccesoInfo = { vitalicio: true } | { vitalicio: false; fecha: Date | null };

export function finAccesoConEtiqueta(
  fechaInscripcion: string | null,
  fechaRenovacion: string | null,
  etiqueta: string | null,
  etiquetaAsignadaEn: string | null
): FinAccesoInfo {
  const fin = finAccesoCalculado(fechaInscripcion, fechaRenovacion);
  const etiquetaKey = etiquetaAsignadaEn ? (etiqueta?.trim().toLowerCase() ?? "") : "";

  if (etiquetaKey === "más+" || etiquetaKey === "más+ usa" || etiquetaKey === "mas") {
    return { vitalicio: true };
  }

  if (!fin) return { vitalicio: false, fecha: null };

  if (etiquetaKey === "black access") {
    const finExtendido = new Date(fin);
    finExtendido.setFullYear(finExtendido.getFullYear() + 1);
    return { vitalicio: false, fecha: finExtendido };
  }

  return { vitalicio: false, fecha: fin };
}

const MESES_POR_MEMBRESIA: Record<string, number> = {
  "3 meses": 3,
  "6 meses": 6,
  "12 meses": 12,
};

// A partir de la fecha de inscripción (ISO) y el tipo de membresía ("3/6/12
// Meses"), calcula cuándo vence el acceso a Skool.
export function calcularVencimientoSkool(fechaInscripcion: string, tipoMembresia: string | null): Date | null {
  const meses = tipoMembresia ? MESES_POR_MEMBRESIA[tipoMembresia.trim().toLowerCase()] : undefined;
  if (!meses) return null;
  const inicio = new Date(fechaInscripcion);
  if (Number.isNaN(inicio.getTime())) return null;
  const fin = new Date(inicio);
  fin.setMonth(fin.getMonth() + meses);
  return fin;
}
