// Datos de ejemplo para armar la vista de Estadísticas mientras se conecta
// la funcionalidad real (el formulario de Moderación, que es lo que en
// realidad va a ir llenando estos números). Nada de esto se guarda ni se
// lee de Supabase todavía.

export type Plataforma = "facebook" | "instagram" | "tiktok" | "skool";

export type HistorialComentario = {
  fecha: string;
  usuario: string;
  comentario: string;
  motivo: string;
  accion: "Eliminado" | "Sin acción";
};

export type EstadisticasPlataforma = {
  comentariosRevisados: number;
  comentariosRevisadosDelta: number;
  comentariosBorrados: number;
  comentariosBorradosDelta: number;
  publicacionesRevisadas: number;
  publicacionesRevisadasDelta: number;
  interaccionesTotales: number;
  interaccionesTotalesDelta: number;
  motivosEliminacion: { nombre: string; cantidad: number }[];
  palabrasClave: { nombre: string; cantidad: number }[];
  historial: HistorialComentario[];
};

const MOTIVOS_BASE = [
  { nombre: "Spam", cantidad: 16 },
  { nombre: "Ofensas", cantidad: 9 },
  { nombre: "Ventas no autorizadas", cantidad: 6 },
  { nombre: "Información falsa", cantidad: 4 },
  { nombre: "Otros", cantidad: 3 },
];

const HISTORIAL_BASE: HistorialComentario[] = [
  { fecha: "25/09/2026", usuario: "Ana_G", comentario: "¿Cuánto cuesta el curso?", motivo: "Ventas no autorizadas", accion: "Eliminado" },
  { fecha: "25/09/2026", usuario: "Carlos M.", comentario: "Esto es una estafa", motivo: "Ofensas", accion: "Eliminado" },
  { fecha: "24/09/2026", usuario: "user123", comentario: "Pasen el link por WhatsApp", motivo: "Spam", accion: "Eliminado" },
  { fecha: "23/09/2026", usuario: "Marta L.", comentario: "Excelente contenido, gracias", motivo: "—", accion: "Sin acción" },
  { fecha: "22/09/2026", usuario: "pedro_rm", comentario: "Yo también vendo algo parecido, escríbanme", motivo: "Ventas no autorizadas", accion: "Eliminado" },
];

export const ESTADISTICAS_POR_PLATAFORMA: Record<Plataforma, EstadisticasPlataforma> = {
  facebook: {
    comentariosRevisados: 542,
    comentariosRevisadosDelta: 12,
    comentariosBorrados: 38,
    comentariosBorradosDelta: 5,
    publicacionesRevisadas: 24,
    publicacionesRevisadasDelta: 20,
    interaccionesTotales: 1230,
    interaccionesTotalesDelta: 13,
    motivosEliminacion: MOTIVOS_BASE,
    palabrasClave: [
      { nombre: "curso", cantidad: 12 },
      { nombre: "precio", cantidad: 8 },
      { nombre: "estafa", cantidad: 6 },
      { nombre: "whatsapp", cantidad: 5 },
      { nombre: "gratis", cantidad: 4 },
      { nombre: "fraude", cantidad: 3 },
      { nombre: "inscripción", cantidad: 3 },
      { nombre: "cuándo", cantidad: 2 },
    ],
    historial: HISTORIAL_BASE,
  },
  instagram: {
    comentariosRevisados: 318,
    comentariosRevisadosDelta: 7,
    comentariosBorrados: 21,
    comentariosBorradosDelta: -4,
    publicacionesRevisadas: 16,
    publicacionesRevisadasDelta: 9,
    interaccionesTotales: 2104,
    interaccionesTotalesDelta: 18,
    motivosEliminacion: [
      { nombre: "Spam", cantidad: 9 },
      { nombre: "Ofensas", cantidad: 5 },
      { nombre: "Ventas no autorizadas", cantidad: 4 },
      { nombre: "Información falsa", cantidad: 2 },
      { nombre: "Otros", cantidad: 1 },
    ],
    palabrasClave: [
      { nombre: "link", cantidad: 10 },
      { nombre: "precio", cantidad: 7 },
      { nombre: "seguidores", cantidad: 5 },
      { nombre: "promo", cantidad: 4 },
      { nombre: "contacto", cantidad: 3 },
    ],
    historial: [
      { fecha: "25/09/2026", usuario: "@lau.fit", comentario: "Me interesa, mándenme info", motivo: "—", accion: "Sin acción" },
      { fecha: "24/09/2026", usuario: "@promo_mx22", comentario: "Mejor precio en mi perfil", motivo: "Ventas no autorizadas", accion: "Eliminado" },
      { fecha: "23/09/2026", usuario: "@carla_rz", comentario: "Esto no sirve, es un fraude", motivo: "Información falsa", accion: "Eliminado" },
    ],
  },
  tiktok: {
    comentariosRevisados: 701,
    comentariosRevisadosDelta: 24,
    comentariosBorrados: 54,
    comentariosBorradosDelta: 15,
    publicacionesRevisadas: 11,
    publicacionesRevisadasDelta: -8,
    interaccionesTotales: 5890,
    interaccionesTotalesDelta: 31,
    motivosEliminacion: [
      { nombre: "Spam", cantidad: 28 },
      { nombre: "Ofensas", cantidad: 14 },
      { nombre: "Ventas no autorizadas", cantidad: 7 },
      { nombre: "Información falsa", cantidad: 3 },
      { nombre: "Otros", cantidad: 2 },
    ],
    palabrasClave: [
      { nombre: "estafa", cantidad: 15 },
      { nombre: "gratis", cantidad: 11 },
      { nombre: "link bio", cantidad: 9 },
      { nombre: "curso", cantidad: 6 },
      { nombre: "precio", cantidad: 4 },
    ],
    historial: [
      { fecha: "25/09/2026", usuario: "@user_xyz", comentario: "Link en mi bio, mejor precio", motivo: "Spam", accion: "Eliminado" },
      { fecha: "24/09/2026", usuario: "@nad.ia", comentario: "Esto se ve increíble", motivo: "—", accion: "Sin acción" },
    ],
  },
  skool: {
    comentariosRevisados: 97,
    comentariosRevisadosDelta: 3,
    comentariosBorrados: 4,
    comentariosBorradosDelta: -20,
    publicacionesRevisadas: 8,
    publicacionesRevisadasDelta: 6,
    interaccionesTotales: 410,
    interaccionesTotalesDelta: 5,
    motivosEliminacion: [
      { nombre: "Spam", cantidad: 2 },
      { nombre: "Ofensas", cantidad: 1 },
      { nombre: "Ventas no autorizadas", cantidad: 1 },
      { nombre: "Información falsa", cantidad: 0 },
      { nombre: "Otros", cantidad: 0 },
    ],
    palabrasClave: [
      { nombre: "soporte", cantidad: 6 },
      { nombre: "acceso", cantidad: 4 },
      { nombre: "duda", cantidad: 3 },
    ],
    historial: [
      { fecha: "22/09/2026", usuario: "miguel.cs", comentario: "No me carga el módulo 3", motivo: "—", accion: "Sin acción" },
      { fecha: "20/09/2026", usuario: "spam_bot99", comentario: "Gana dinero fácil aquí", motivo: "Spam", accion: "Eliminado" },
    ],
  },
};

export function estadisticasGenerales(): EstadisticasPlataforma {
  const todas = Object.values(ESTADISTICAS_POR_PLATAFORMA);
  const sumar = (campo: keyof Pick<EstadisticasPlataforma, "comentariosRevisados" | "comentariosBorrados" | "publicacionesRevisadas" | "interaccionesTotales">) =>
    todas.reduce((acc, e) => acc + e[campo], 0);
  const promediar = (campo: keyof Pick<EstadisticasPlataforma, "comentariosRevisadosDelta" | "comentariosBorradosDelta" | "publicacionesRevisadasDelta" | "interaccionesTotalesDelta">) =>
    Math.round(todas.reduce((acc, e) => acc + e[campo], 0) / todas.length);

  const motivosMapa = new Map<string, number>();
  for (const e of todas) for (const m of e.motivosEliminacion) motivosMapa.set(m.nombre, (motivosMapa.get(m.nombre) ?? 0) + m.cantidad);

  const palabrasMapa = new Map<string, number>();
  for (const e of todas) for (const p of e.palabrasClave) palabrasMapa.set(p.nombre, (palabrasMapa.get(p.nombre) ?? 0) + p.cantidad);

  return {
    comentariosRevisados: sumar("comentariosRevisados"),
    comentariosRevisadosDelta: promediar("comentariosRevisadosDelta"),
    comentariosBorrados: sumar("comentariosBorrados"),
    comentariosBorradosDelta: promediar("comentariosBorradosDelta"),
    publicacionesRevisadas: sumar("publicacionesRevisadas"),
    publicacionesRevisadasDelta: promediar("publicacionesRevisadasDelta"),
    interaccionesTotales: sumar("interaccionesTotales"),
    interaccionesTotalesDelta: promediar("interaccionesTotalesDelta"),
    motivosEliminacion: [...motivosMapa.entries()].map(([nombre, cantidad]) => ({ nombre, cantidad })),
    palabrasClave: [...palabrasMapa.entries()]
      .map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 8),
    historial: todas
      .flatMap((e) => e.historial)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1)),
  };
}
