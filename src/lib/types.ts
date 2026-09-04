export type Variante = "MX" | "US" | null;

export type AccesoDetalle = {
  activo: boolean;
  cantidad: number;
  variante: Variante;
};

// Cada categoría es una LISTA de boletos (no un solo detalle) porque un
// mismo cliente puede tener a la vez, por ejemplo, VIP MX y VIP US —
// algunos eventos reales del inventario dan ambos (ver
// REGLAS-BOLETOS-SYNERGY.md sección 3). En la práctica son 0, 1 o 2
// entradas por categoría (una por variante MX/US); "black" nunca tiene
// variante, así que solo llega a tener 0 o 1.
export type Accesos = {
  general: AccesoDetalle[];
  vip: AccesoDetalle[];
  black: AccesoDetalle[];
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
  // ISO — se llena solo con el botón "Renovar" de este CRM (fechaInscripcion
  // nunca se toca al renovar). "Fin de acceso" no es un campo guardado: se
  // calcula siempre con finAccesoCalculado(fechaInscripcion, fechaRenovacion)
  // — ver src/lib/fechas.ts.
  fechaRenovacion: string | null;
  boletosSinInformacion: boolean; // true si el evento no existe en la tabla de inventario y no hay override
  accesos: Accesos;
  // true cuando un admin corrigió los accesos a mano ("Editar accesos") —
  // mientras esté en true, ningún recálculo automático los vuelve a tocar
  // (recalcularAccesos lo respeta), hasta que se libere a propósito.
  accesosEditadoManual: boolean;

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
  // Cuándo se asignó la etiqueta ACTUAL — null si nunca se asignó por el
  // flujo normal (ej. clientes migrados desde el CSV). Ver
  // finAccesoConEtiqueta() en fechas.ts: el ajuste de "Fin de acceso" por
  // MÁS+/Black Access solo aplica cuando esto no es null.
  etiquetaAsignadaEn: string | null;

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
  | "OFERTA_REVOCADA"
  | "COMPRA_HOTMART";

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
  "COMPRA_HOTMART",
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
  COMPRA_HOTMART: "Compra detectada (Hotmart)",
};

export type Db = {
  clientes: Cliente[];
  eventos: EventoTimeline[];
};

// Estados posibles del "Mensaje de Bienvenida WA". La automatización escribe
// "Pendiente" al pedir el envío (o al reintentarlo), y luego el webhook real
// de GHL lo cierra en "Enviado" o "No se pudo entregar" — nunca deja una
// entrega fallida confirmada mezclada con "Pendiente" (que es "sin
// confirmar todavía", no "falló"). "Número Inválido" es exclusivamente una
// elección manual del equipo.
export const ESTADOS_MENSAJE_BIENVENIDA_WA = ["Enviado", "Pendiente", "No se pudo entregar", "Número Inválido"] as const;
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
  etiqueta: string | null;
  comprobantes: string[]; // rutas en el bucket privado "comprobantes-pago"
  estado: EstadoSolicitud;
  solicitadoPorId: string;
  solicitadoPorNombre: string;
  notaRevision: string | null;
  revisadoPor: string | null;
  revisadoEn: string | null;
  clienteId: string | null;
  creadoEn: string;
  // Id del lead en el CRM de VSL cuando esta solicitud se creó sola por la
  // sincronización automática — null si la llenó un vendedor a mano.
  leadIdVsl: string | null;
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

// Quién confirmó "Enterado" un aviso, y cuándo — solo se le manda al
// front cuando el que pide la lista es admin (ver listarAvisos en
// src/lib/avisos.ts).
export type AvisoConfirmacion = {
  usuarioId: string;
  usuarioNombre: string;
  confirmadoEn: string;
};

// Aviso interno del equipo (ver Avisos y Actualizaciones). confirmaciones
// viene null para coordinador/abeja — no es que esté vacío, es que el back
// ni siquiera se los manda.
export type Aviso = {
  id: string;
  titulo: string;
  mensaje: string;
  // null = generado por el sistema (ej. reconciliación automática de
  // Kajabi), no por un usuario real — ver crearAvisoAutomatico en avisos.ts.
  autorId: string | null;
  autorNombre: string;
  creadoEn: string;
  editadoEn: string | null;
  confirmaciones: AvisoConfirmacion[] | null;
};
