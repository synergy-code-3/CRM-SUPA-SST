// Integración de solo lectura con "Synergy Axis" — el CRM que lleva el
// histórico completo de todos los clientes (primer contacto, eventos a los
// que fue, boletos escaneados, compras, y estado de sus accesos a Synergy
// Unlimited). Consulta en vivo, nunca se guarda copia en este CRM.

export type AxisPrimerContacto = {
  fecha: string;
  fuenteSistema: string;
  embudo: string | null;
  utmSource: string | null;
};

export type AxisContacto = {
  id: string;
  email: string;
  emailsConocidos: string[];
  nombre: string;
  telefono: string | null;
  ubicacion: string | null;
  lifecycleStage: string | null;
  primerContacto: AxisPrimerContacto | null;
  ultimaActividad: string | null;
  ltvCents: number | null;
};

export type AxisEvento = {
  titulo: string;
  tipo: string; // "registration" | "attendance" | ...
  fecha: string;
  fuenteSistema: string;
  fuenteTabla: string;
  embudo: string | null;
  tipoAcceso: string | null;
  montoCents: number | null;
  currency: string | null;
  // Solo aplica a boletos de la ticketera (fuenteSistema="synergyticket",
  // fuenteTabla="tickets") — en cualquier otro evento viene null.
  escaneado: boolean | null;
  escaneadoEn: string | null;
};

export type AxisCompra = {
  producto: string;
  plataforma: string; // sistema de cobro real: synergyticket, custom-stripe, kajabi, etc.
  estado: string;
  montoCents: number | null;
  montoCobradoCents: number | null;
  currency: string | null;
  fecha: string;
};

export type AxisDerechoCalculado = { categoria: string; pais: string; cantidad: number };

export type AxisBoletoEntregado = {
  categoria: string;
  pais: string;
  estado: string; // pendiente | emitido | fallido
  esTitular: boolean;
  asignadoNombre: string | null;
  asignadoEmail: string | null;
  ticketUrl: string | null;
  error: string | null;
};

export type AxisSynergyUnlimited = {
  elegible: boolean;
  motivo: string | null;
  derechosCalculados: AxisDerechoCalculado[];
  boletosEntregados: AxisBoletoEntregado[];
};

export type HistorialAxis = {
  contacto: AxisContacto;
  eventos: AxisEvento[];
  compras: AxisCompra[];
  synergyUnlimited: AxisSynergyUnlimited;
};

const URL_HISTORIAL = "https://synergy-axis.vercel.app/api/internal/historial-cliente";

// Forma cruda tal como la devuelve la API de Axis (snake_case) — solo se
// usa aquí, para convertirla a la forma camelCase de arriba.
type RespuestaAxisCruda = {
  contacto: {
    id: string;
    email: string;
    emails_conocidos?: string[];
    nombre: string;
    telefono?: string | null;
    ubicacion?: string | null;
    lifecycle_stage?: string | null;
    primer_contacto?: { fecha: string; fuente_sistema: string; embudo?: string | null; utm_source?: string | null } | null;
    ultima_actividad?: string | null;
    ltv_cents?: number | null;
  };
  eventos?: {
    titulo: string;
    tipo: string;
    fecha: string;
    fuente_sistema: string;
    fuente_tabla: string;
    embudo?: string | null;
    tipo_acceso?: string | null;
    monto_cents?: number | null;
    currency?: string | null;
    escaneado?: boolean | null;
    escaneado_en?: string | null;
  }[];
  compras?: {
    producto: string;
    plataforma: string;
    estado: string;
    monto_cents?: number | null;
    monto_cobrado_cents?: number | null;
    currency?: string | null;
    fecha: string;
  }[];
  synergy_unlimited?: {
    elegible?: boolean;
    motivo?: string | null;
    derechos_calculados?: { categoria: string; pais: string; cantidad: number }[];
    boletos_entregados?: {
      categoria: string;
      pais: string;
      estado: string;
      es_titular?: boolean;
      asignado_nombre?: string | null;
      asignado_email?: string | null;
      ticket_url?: string | null;
      error?: string | null;
    }[];
  };
};

function mapearRespuesta(data: RespuestaAxisCruda): HistorialAxis {
  return {
    contacto: {
      id: data.contacto.id,
      email: data.contacto.email,
      emailsConocidos: data.contacto.emails_conocidos ?? [],
      nombre: data.contacto.nombre,
      telefono: data.contacto.telefono ?? null,
      ubicacion: data.contacto.ubicacion ?? null,
      lifecycleStage: data.contacto.lifecycle_stage ?? null,
      primerContacto: data.contacto.primer_contacto
        ? {
            fecha: data.contacto.primer_contacto.fecha,
            fuenteSistema: data.contacto.primer_contacto.fuente_sistema,
            embudo: data.contacto.primer_contacto.embudo ?? null,
            utmSource: data.contacto.primer_contacto.utm_source ?? null,
          }
        : null,
      ultimaActividad: data.contacto.ultima_actividad ?? null,
      ltvCents: data.contacto.ltv_cents ?? null,
    },
    eventos: (data.eventos ?? []).map((e) => ({
      titulo: e.titulo,
      tipo: e.tipo,
      fecha: e.fecha,
      fuenteSistema: e.fuente_sistema,
      fuenteTabla: e.fuente_tabla,
      embudo: e.embudo ?? null,
      tipoAcceso: e.tipo_acceso ?? null,
      montoCents: e.monto_cents ?? null,
      currency: e.currency ?? null,
      escaneado: e.escaneado ?? null,
      escaneadoEn: e.escaneado_en ?? null,
    })),
    compras: (data.compras ?? []).map((c) => ({
      producto: c.producto,
      plataforma: c.plataforma,
      estado: c.estado,
      montoCents: c.monto_cents ?? null,
      montoCobradoCents: c.monto_cobrado_cents ?? null,
      currency: c.currency ?? null,
      fecha: c.fecha,
    })),
    synergyUnlimited: {
      elegible: !!data.synergy_unlimited?.elegible,
      motivo: data.synergy_unlimited?.motivo ?? null,
      derechosCalculados: (data.synergy_unlimited?.derechos_calculados ?? []).map((d) => ({
        categoria: d.categoria,
        pais: d.pais,
        cantidad: d.cantidad,
      })),
      boletosEntregados: (data.synergy_unlimited?.boletos_entregados ?? []).map((b) => ({
        categoria: b.categoria,
        pais: b.pais,
        estado: b.estado,
        esTitular: !!b.es_titular,
        asignadoNombre: b.asignado_nombre ?? null,
        asignadoEmail: b.asignado_email ?? null,
        ticketUrl: b.ticket_url ?? null,
        error: b.error ?? null,
      })),
    },
  };
}

// null = sin contacto para ese correo (404, caso normal — no es un error).
export async function obtenerHistorialAxis(email: string): Promise<HistorialAxis | null> {
  const token = process.env.AXIS_API_TOKEN;
  if (!token) throw new Error("Falta AXIS_API_TOKEN en las variables de entorno");

  const url = `${URL_HISTORIAL}?email=${encodeURIComponent(email.trim().toLowerCase())}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`El CRM de Axis respondió ${res.status}`);
  const data = await res.json();
  return mapearRespuesta(data);
}
