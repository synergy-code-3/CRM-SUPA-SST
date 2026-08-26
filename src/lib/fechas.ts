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
