// Tipos y constantes puros de Certificaciones — SIN imports de servidor
// (supabase, db.ts), a propósito: db.ts arrastra boletos.ts (lee el CSV de
// inventario con node:fs/promises), que rompe el build si un componente
// cliente lo importa transitivamente. Mismo patrón que types.ts para el
// dominio del Club — los componentes cliente importan de aquí, nunca
// directo de certificaciones.ts/certificaciones-sync.ts.

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
