// Tipos y constantes puros de Certificaciones — SIN imports de servidor
// (supabase, db.ts), a propósito: db.ts arrastra boletos.ts (lee el CSV de
// inventario con node:fs/promises), que rompe el build si un componente
// cliente lo importa transitivamente. Mismo patrón que types.ts para el
// dominio del Club — los componentes cliente importan de aquí, nunca
// directo de certificaciones.ts/certificaciones-sync.ts.

import type { Accesos } from "./types";

export type EstadoCertificacion = "NUEVO" | "INVITACION_ENVIADA" | "ACTIVO" | "VENCIDO";
export type MensajeBienvenidaCertificacion = "PENDIENTE" | "ENVIADA" | "INVALIDO";
export type RegionCertificacion = "MX" | "US" | "LATAM" | "PRES_USA" | "PRES_MX" | "BLACK";

export const REGIONES_CERTIFICACION: RegionCertificacion[] = ["MX", "US", "LATAM", "PRES_USA", "PRES_MX", "BLACK"];
export const REGION_CERTIFICACION_LABEL: Record<RegionCertificacion, string> = {
  MX: "Legendar-IA MX",
  US: "Legendar-IA US",
  LATAM: "Legendar-IA LATAM",
  PRES_USA: "Presencial L-IA USA",
  PRES_MX: "Presencial L-IA MX",
  BLACK: "Legendar-IA Black",
};

export type ClienteCertificacion = {
  id: string;
  // Accesos a Synergy Unlimited editados a mano; null = los que tocan por región.
  accesos: Accesos | null;
  nombre: string;
  email: string | null;
  telefono: string | null;
  region: RegionCertificacion | null;
  estado: EstadoCertificacion;
  notas: string | null;
  fechaLlegada: string;
  fechaInvitacion: string | null;
  fechaAceptacion: string | null;
  fechaVencimiento: string | null;
  mensajeBienvenida: MensajeBienvenidaCertificacion;
  pausada: boolean;
  fechaPausa: string | null;
  tags: string[];
  etiquetas: string[];
  vendedor: string | null;
  monto: string | null;
  totalAbonado: number;
  fechaPrimerAbono: string | null;
  creadoPor: string;
  creadoPorRol: string;
  eliminado: boolean;
  fechaEliminacion: string | null;
  creadoEn: string;
};

export type EventoCertificacion = { id: string; tipo: string; nota: string | null; autor: string; creadoEn: string };

export type AbonoCertificacion = {
  id: string;
  monto: number;
  moneda: string | null;
  nota: string | null;
  autor: string;
  creadoEn: string;
};

// Tipos de la revisión de sincronización con la hoja de ventas (ver
// certificaciones-sync.ts) — viven aquí, no ahí, por la misma razón que el
// resto de este archivo: la página de Certificaciones (cliente) los
// necesita solo por su forma, sin arrastrar el resto de ese módulo.
export type CambioPendienteCertificacion = {
  clienteId: string;
  nombre: string;
  correo: string;
  monto?: { actual: string | null; nuevo: string };
  vendedor?: { actual: string | null; nuevo: string };
  telefono?: { actual: string | null; nuevo: string };
  agregarTagMiembroCS?: boolean;
};

export type NuevoClientePendienteCertificacion = {
  correo: string;
  nombre: string;
  telefono: string | null;
  region: RegionCertificacion;
  vendedor: string | null;
  monto: string | null;
  tags: string[];
};

export type ResultadoSincronizacionCertificacion = {
  filasLeidas: number;
  ganadoras: number;
  omitidos: number;
  errores: string[];
  cambiosPendientes: CambioPendienteCertificacion[];
  nuevosPendientes: NuevoClientePendienteCertificacion[];
};

// Solicitud de alta para Certificaciones — mismo concepto que
// SolicitudCliente (types.ts) del Club, pero con un solo correo (sin la
// separación pago/acceso, que aquí no aplica) y region en vez de evento.
export type EstadoSolicitudCertificacion = "pendiente" | "aprobada" | "rechazada";

export type SolicitudCertificacion = {
  id: string;
  nombre: string;
  correo: string;
  telefono: string;
  region: RegionCertificacion | null;
  monto: string | null;
  etiqueta: string | null;
  notas: string | null;
  comprobantes: string[];
  estado: EstadoSolicitudCertificacion;
  solicitadoPorId: string;
  solicitadoPorNombre: string;
  notaRevision: string | null;
  revisadoPor: string | null;
  revisadoEn: string | null;
  clienteId: string | null;
  leadIdVsl: string | null;
  creadoEn: string;
};

// Accesos a Synergy Unlimited que le tocan a cada región (mismo mapeo que
// BENEFICIOS_POR_REGION en constantes.ts) en el formato de accesos del Club.
// La asesoría 1 a 1 de BLACK no es un acceso a Synergy, por eso no entra.
export function accesosDeRegion(region: RegionCertificacion | null): Accesos {
  const a = (cantidad: number, variante: "MX" | "US" | null) => ({ activo: true, cantidad, variante });
  switch (region) {
    case "MX":
    case "LATAM":
      return { general: [a(1, "MX")], vip: [], black: [] };
    case "US":
      return { general: [a(1, "US")], vip: [a(1, "MX")], black: [] };
    case "PRES_USA":
      return { general: [a(2, "US")], vip: [a(2, "MX")], black: [] };
    case "PRES_MX":
      return { general: [a(2, "MX")], vip: [], black: [] };
    case "BLACK":
      return { general: [], vip: [], black: [a(1, null)] };
    default:
      return { general: [], vip: [], black: [] };
  }
}
