// Colores de los tags de Certificaciones. Tres tags tienen color fijo por
// significado (activo = verde, vencido = rojo, equipo = azul); el resto toma
// un color propio de la paleta según su orden de creación en el catálogo,
// así dos tags no comparten color mientras haya colores libres. La paleta no
// incluye verde, rojo ni azul para que esos tres siempre se distingan.
export const COLOR_RESERVADO: Record<string, string> = {
  "club sinergético: activo": "bg-success/15 text-success",
  "club sinergético: vencido": "bg-danger/15 text-danger",
  "miembro del equipo": "bg-primary/15 text-primary",
};

export const PALETA_TAGS = [
  "bg-purple-500/15 text-purple-600",
  "bg-pink-500/15 text-pink-600",
  "bg-amber-500/15 text-amber-700",
  "bg-cyan-500/15 text-cyan-700",
  "bg-orange-500/15 text-orange-600",
  "bg-fuchsia-500/15 text-fuchsia-600",
  "bg-teal-500/15 text-teal-700",
  "bg-lime-500/15 text-lime-700",
  "bg-yellow-500/20 text-yellow-700",
  "bg-slate-500/15 text-slate-600",
  "bg-violet-500/15 text-violet-600",
  "bg-stone-500/15 text-stone-600",
];

export function esTagReservado(nombre: string): boolean {
  return nombre.trim().toLowerCase() in COLOR_RESERVADO;
}

let orden: string[] = [];

// Orden de creación de los tags del catálogo (sin los reservados). Lo llena
// useColoresTags con la respuesta de /api/biblioteca.
export function registrarOrdenTags(nuevo: string[]) {
  orden = nuevo.filter((t) => !esTagReservado(t));
}

export function colorDeTag(nombre: string): string {
  const reservado = COLOR_RESERVADO[nombre.trim().toLowerCase()];
  if (reservado) return reservado;
  const i = orden.indexOf(nombre);
  if (i >= 0) return PALETA_TAGS[i % PALETA_TAGS.length];
  let hash = 0;
  for (let k = 0; k < nombre.length; k++) hash = (hash * 31 + nombre.charCodeAt(k)) >>> 0;
  return PALETA_TAGS[hash % PALETA_TAGS.length];
}
