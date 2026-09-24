import type { EstadoCertificacion, MensajeBienvenidaCertificacion, RegionCertificacion } from "@/lib/certificaciones-tipos";

// Constantes de presentación de Certificaciones (portadas del CRM original,
// src/lib/constants.ts) — puras, sin imports de servidor.

export const ESTADO_LABEL: Record<EstadoCertificacion, string> = {
  NUEVO: "Nuevo",
  INVITACION_ENVIADA: "Invitación enviada",
  ACTIVO: "Miembro",
  VENCIDO: "Vencido",
};

export const BIENVENIDA_LABEL: Record<MensajeBienvenidaCertificacion, string> = {
  PENDIENTE: "Pendiente",
  ENVIADA: "Enviada",
  INVALIDO: "Número inválido",
};
export const ESTADOS_BIENVENIDA: MensajeBienvenidaCertificacion[] = ["PENDIENTE", "ENVIADA", "INVALIDO"];

export const EVENTO_LABEL: Record<string, string> = {
  LLEGADA: "Cliente registrado",
  INVITACION_ENVIADA: "Invitación enviada",
  INVITACION_ACEPTADA: "Invitación aceptada",
  RENOVACION: "Membresía renovada",
  VENCIMIENTO: "Membresía vencida",
  NOTA: "Nota",
  ELIMINACION: "Cliente eliminado",
  IMPORTACION: "Cliente importado por CSV",
  MENSAJE_BIENVENIDA: "Mensaje de bienvenida",
  RESTAURACION: "Acción deshecha",
  PAUSA: "Membresía pausada",
  REANUDACION: "Membresía reanudada",
  EXTENSION: "Membresía extendida",
  TAGS: "Tags actualizados",
  VENDEDOR: "Vendedor actualizado",
  ETIQUETAS: "Certificación asignada",
  EDICION: "Datos del cliente editados",
  PAPELERA: "Enviado a la papelera",
  RESTAURACION_PAPELERA: "Restaurado de la papelera",
  ELIMINACION_PERMANENTE: "Eliminado definitivamente",
  ABONO: "Abono registrado",
};

export const COLORES_TAG = [
  "bg-primary/10 text-primary",
  "bg-success/10 text-success",
  "bg-warning/10 text-warning",
  "bg-danger/10 text-danger",
  "bg-purple-500/10 text-purple-600",
  "bg-pink-500/10 text-pink-600",
  "bg-cyan-500/10 text-cyan-600",
  "bg-amber-500/10 text-amber-600",
];

// Color estable por nombre (mismo criterio que colorParaNombre del CRM
// original: hash del nombre → una de las 8 combinaciones).
export function colorDeTag(nombre: string): string {
  let hash = 0;
  for (let i = 0; i < nombre.length; i++) hash = (hash * 31 + nombre.charCodeAt(i)) >>> 0;
  return COLORES_TAG[hash % COLORES_TAG.length];
}

export const CERTIFICACION_LEGENDAR_IA = "Legendar-IA";

export type Beneficio = { evento: string; tipo: string; cantidad: number };

// Synergy Unlimited: los boletos de cada socio dependen de su región (mismo
// mapeo que el CRM original).
export const BENEFICIOS_POR_REGION: Record<RegionCertificacion, Beneficio[]> = {
  MX: [{ evento: "Synergy Unlimited MX", tipo: "General", cantidad: 1 }],
  US: [
    { evento: "Synergy Unlimited MX", tipo: "VIP", cantidad: 1 },
    { evento: "Synergy Unlimited US", tipo: "General", cantidad: 1 },
  ],
  LATAM: [{ evento: "Synergy Unlimited MX", tipo: "General", cantidad: 1 }],
  PRES_USA: [
    { evento: "Synergy Unlimited MX", tipo: "VIP", cantidad: 2 },
    { evento: "Synergy Unlimited US", tipo: "General", cantidad: 2 },
  ],
  PRES_MX: [{ evento: "Synergy Unlimited MX", tipo: "General", cantidad: 2 }],
  BLACK: [
    { evento: "Asesoría 1 a 1 con especialista", tipo: "Asesoría", cantidad: 3 },
    { evento: "Synergy Unlimited MX", tipo: "Black", cantidad: 1 },
  ],
};

export function beneficiosDeRegion(region: RegionCertificacion | null): Beneficio[] {
  return region ? BENEFICIOS_POR_REGION[region] : [];
}

// Estado efectivo: un cliente cuya fecha de vencimiento ya pasó cuenta como
// VENCIDO (salvo que esté pausado) — igual que estadoActual() del original.
export function estadoReal(c: {
  estado: EstadoCertificacion;
  pausada: boolean;
  fechaVencimiento: string | null;
}): EstadoCertificacion {
  if (c.pausada) return c.estado;
  if (c.fechaVencimiento && new Date(c.fechaVencimiento) < new Date()) return "VENCIDO";
  return c.estado;
}

export function diasRestantes(c: {
  fechaVencimiento: string | null;
  pausada: boolean;
  fechaPausa: string | null;
}): number | null {
  if (!c.fechaVencimiento) return null;
  const referencia = c.pausada && c.fechaPausa ? new Date(c.fechaPausa).getTime() : Date.now();
  return Math.ceil((new Date(c.fechaVencimiento).getTime() - referencia) / 86400000);
}

// Activo = con vencimiento vigente y sin pausar (badge "Activo" de la lista).
export function estaActivo(c: { fechaVencimiento: string | null; pausada: boolean }): boolean {
  return !!c.fechaVencimiento && !c.pausada && new Date(c.fechaVencimiento).getTime() >= Date.now();
}
