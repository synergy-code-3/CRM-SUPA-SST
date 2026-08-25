export type Variante = "MX" | "US" | null;

export type AccesoDetalle = {
  activo: boolean;
  cantidad: number;
  variante: Variante;
};

export type Accesos = {
  general: AccesoDetalle;
  vip: AccesoDetalle;
  black: AccesoDetalle;
};

export type Cliente = {
  id: string; // email normalizado, identificador principal
  nombre: string;
  email: string;
  telefono: string | null;
  pais: string | null;
  ciudad: string | null;
  notas: string | null;
  fechaInscripcion: string | null; // ISO
  finAcceso: string | null; // ISO — FIN DEL ACCESO del CSV de origen
  boletosSinInformacion: boolean; // true si el evento no existe en la tabla de inventario y no hay override
  accesos: Accesos;

  // Posición en el CSV de origen (número de fila de la última aparición de
  // este correo). Es el criterio de orden de la lista principal: la fila
  // más alta del CSV = la más reciente = primero en el CRM. Clientes creados
  // manualmente reciben un valor mayor a cualquier fila del CSV para
  // aparecer arriba de todos.
  ordenCsv: number;

  // Columnas B–N del CSV de origen: seguimiento del evento/membresía.
  fechaEvento: string | null; // Fecha Ev.
  evento: string | null; // EVENTO
  accesoPlataforma: string | null; // Acceso a plataforma
  tipoMembresia: string | null; // Tipo de Membresia
  vencimientoSkool: string | null; // Vencimiento Skool
  invitacionSkool: string | null; // Invitacion de Skool
  contactoWhats: string | null; // Mensaje de Bienvenida WA (antes "Contacto en Whats" en el CSV de origen)
  llamada: string | null; // Llamada

  // Columna U: notas del equipo de soporte técnico.
  notasSoporte: string | null;

  // Clasificación propia del CRM, independiente de los tags de Kajabi.
  etiqueta: string | null;

  // Tags asignados desde el panel del cliente (catálogo "Biblioteca"),
  // distintos de "etiqueta": un cliente puede tener varios.
  tags: string[];

  // Id del contacto en Kajabi, si ya se creó/vinculó ahí.
  kajabiContactId: string | null;

  // Archivado (no borrado real): si tiene fecha, el cliente está en
  // "Eliminados" — fuera de la lista principal, pero con su fila y timeline
  // intactas.
  eliminadoEn: string | null;

  // Pausa de membresía: si tiene fecha, el acceso está revocado en Kajabi a
  // propósito (no vencido). finAccesoAlPausar es la foto de finAcceso justo
  // al pausar, para calcular los días restantes al reanudar.
  pausadoEn: string | null;
  finAccesoAlPausar: string | null;

  creadoEn: string; // ISO
  actualizadoEn: string; // ISO
};

export type TipoEvento =
  | "CREACION"
  | "EDICION" // legado — ya no se escribe, se dejó por los eventos viejos ya guardados
  | "EDICION_DATOS"
  | "EDICION_ACCESOS"
  | "EDICION_TAGS"
  | "NOTA"
  | "ACCESO_GENERAL" // legado
  | "ACCESO_VIP" // legado
  | "ACCESO_BLACK" // legado
  | "PAUSA"
  | "REANUDACION"
  | "RENOVACION"
  | "REVOCACION_ACCESO"
  | "WA_BIENVENIDA"
  | "IMPORTACION"
  | "KAJABI"
  | "ELIMINADO"
  | "OFERTA_OTORGADA"
  | "OFERTA_REVOCADA";

// Tipos "activos": los que el buscador de Actividad ofrece para filtrar. Los
// marcados como legado arriba solo existen en eventos viejos ya guardados —
// se siguen mostrando si aparecen, pero no tiene caso ofrecerlos como opción
// de filtro nueva.
export const TIPOS_EVENTO_FILTRABLES: TipoEvento[] = [
  "CREACION",
  "EDICION_DATOS",
  "EDICION_ACCESOS",
  "EDICION_TAGS",
  "NOTA",
  "PAUSA",
  "REANUDACION",
  "RENOVACION",
  "REVOCACION_ACCESO",
  "WA_BIENVENIDA",
  "IMPORTACION",
  "KAJABI",
  "ELIMINADO",
  "OFERTA_OTORGADA",
  "OFERTA_REVOCADA",
];

export type EventoTimeline = {
  id: string;
  clienteId: string;
  tipo: TipoEvento;
  detalle: string;
  autor: string;
  fecha: string; // ISO
};

// Nombre a mostrar para cada tipo de evento — compartido entre la Timeline
// del perfil del cliente y la página de Actividad (búsqueda/filtros/reportes).
export const TIPO_EVENTO_LABEL: Record<TipoEvento, string> = {
  CREACION: "Cliente creado",
  EDICION: "Datos editados",
  EDICION_DATOS: "Datos editados",
  EDICION_ACCESOS: "Accesos editados",
  EDICION_TAGS: "Tags editados",
  NOTA: "Nota",
  ACCESO_GENERAL: "Acceso General",
  ACCESO_VIP: "Acceso VIP",
  ACCESO_BLACK: "Black Access",
  PAUSA: "Membresía pausada",
  REANUDACION: "Membresía reanudada",
  RENOVACION: "Membresía renovada",
  REVOCACION_ACCESO: "Acceso revocado",
  WA_BIENVENIDA: "Mensaje de Bienvenida WA",
  IMPORTACION: "Importado",
  KAJABI: "Kajabi",
  ELIMINADO: "Cliente eliminado",
  OFERTA_OTORGADA: "Oferta adicional otorgada",
  OFERTA_REVOCADA: "Oferta adicional revocada",
};

export type Db = {
  clientes: Cliente[];
  eventos: EventoTimeline[];
};

// Estados posibles del "Mensaje de Bienvenida WA". La automatización (alta de
// cliente o el botón "Enviar") solo escribe "Enviado" o "Pendiente" —
// "Número Inválido" es exclusivamente una elección manual del equipo.
export const ESTADOS_MENSAJE_BIENVENIDA_WA = ["Enviado", "Pendiente", "Número Inválido"] as const;
export type EstadoMensajeBienvenidaWa = (typeof ESTADOS_MENSAJE_BIENVENIDA_WA)[number];

// Solicitud de alta de cliente hecha por un vendedor (cualquier rol) desde
// "Solicitudes" en el menú — sustituye el flujo de mandar los datos por
// WhatsApp. Queda pendiente hasta que un admin la aprueba (crea el cliente
// de verdad, con Kajabi/Skool/GHL) o la rechaza.
export const ESTADOS_SOLICITUD = ["pendiente", "aprobada", "rechazada"] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

export type SolicitudCliente = {
  id: string;
  nombre: string;
  correoPago: string;
  correoAcceso: string;
  telefono: string;
  pais: string | null;
  evento: string;
  tipoMembresia: string;
  comprobantes: string[]; // rutas en el bucket privado "comprobantes-pago"
  estado: EstadoSolicitud;
  solicitadoPorId: string;
  solicitadoPorNombre: string;
  notaRevision: string | null;
  revisadoPor: string | null;
  revisadoEn: string | null;
  clienteId: string | null;
  creadoEn: string;
};

// "Otras Ofertas": roster independiente de Clientes (Club Sinergético). Ver
// tabla otras_ofertas_clientes — un registro por persona identificada por
// correo, en su propio espacio de ids (no se cruza con clientes.id).
export type OtraOfertaCliente = {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  tags: string[];
  etiqueta: string | null;
  ordenCsv: number;
  kajabiContactId: string | null;
  creadoEn: string;
  actualizadoEn: string;
  // Título de la oferta otorgada más recientemente — solo lo llena
  // listarOtrasOfertasClientes (para la columna de la lista); en el resto
  // de los casos queda en null, el detalle trae el historial completo.
  ultimaOferta: string | null;
};

// Una oferta otorgada, fechada — usado tanto por otras_ofertas_otorgadas
// (roster de Otras Ofertas) como por clientes_ofertas (ofertas extra de un
// cliente del Club). revocadoEn/revocadoPor quedan null mientras la oferta
// sigue activa.
export type OfertaOtorgada = {
  id: string;
  clienteId: string;
  ofertaId: string;
  ofertaTitulo: string;
  fechaOtorgada: string;
  finAcceso: string;
  otorgadoPor: string;
  revocadoEn: string | null;
  revocadoPor: string | null;
};
