import { supabase } from "@/lib/supabase";
import type { EstadoSolicitudCertificacion, RegionCertificacion, SolicitudCertificacion } from "@/lib/certificaciones-tipos";

// Solicitudes de alta para Certificaciones — puerto de src/lib/solicitudes.ts
// (Club) a la forma más simple de Certificaciones (un solo correo, region en
// vez de evento). Ver supabase/schema.sql (solicitudes_certificacion).

type SolicitudRow = {
  id: string;
  nombre: string;
  correo: string;
  telefono: string;
  region: string | null;
  monto: string | null;
  etiqueta: string | null;
  notas: string | null;
  comprobantes: string[] | null;
  estado: EstadoSolicitudCertificacion;
  solicitado_por_id: string;
  solicitado_por_nombre: string;
  nota_revision: string | null;
  revisado_por: string | null;
  revisado_en: string | null;
  cliente_id: string | null;
  lead_id_vsl: string | null;
  creado_en: string;
};

function filaASolicitud(row: SolicitudRow): SolicitudCertificacion {
  return {
    id: row.id,
    nombre: row.nombre,
    correo: row.correo,
    telefono: row.telefono,
    region: (row.region as RegionCertificacion) || null,
    monto: row.monto,
    etiqueta: row.etiqueta,
    notas: row.notas,
    comprobantes: row.comprobantes ?? [],
    estado: row.estado,
    solicitadoPorId: row.solicitado_por_id,
    solicitadoPorNombre: row.solicitado_por_nombre,
    notaRevision: row.nota_revision,
    revisadoPor: row.revisado_por,
    revisadoEn: row.revisado_en,
    clienteId: row.cliente_id,
    leadIdVsl: row.lead_id_vsl,
    creadoEn: row.creado_en,
  };
}

export async function crearSolicitudCertificacion(input: {
  id?: string;
  nombre: string;
  correo: string;
  telefono: string;
  region?: string | null;
  monto?: string | null;
  etiqueta?: string | null;
  notas?: string | null;
  comprobantes: string[];
  solicitadoPorId: string;
  solicitadoPorNombre: string;
  leadIdVsl?: string | null;
}): Promise<SolicitudCertificacion> {
  const { data, error } = await supabase
    .from("solicitudes_certificacion")
    .insert({
      ...(input.id ? { id: input.id } : {}),
      nombre: input.nombre.trim(),
      correo: input.correo.trim().toLowerCase(),
      telefono: input.telefono.trim(),
      region: input.region?.trim() || null,
      monto: input.monto?.trim() || null,
      etiqueta: input.etiqueta?.trim() || null,
      notas: input.notas?.trim() || null,
      comprobantes: input.comprobantes,
      solicitado_por_id: input.solicitadoPorId,
      solicitado_por_nombre: input.solicitadoPorNombre,
      lead_id_vsl: input.leadIdVsl ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return filaASolicitud(data as SolicitudRow);
}

export async function obtenerSolicitudCertificacionPorLeadVsl(leadId: string): Promise<SolicitudCertificacion | null> {
  const { data, error } = await supabase.from("solicitudes_certificacion").select("*").eq("lead_id_vsl", leadId).maybeSingle();
  if (error) throw error;
  return data ? filaASolicitud(data as SolicitudRow) : null;
}

export async function editarSolicitudCertificacion(
  id: string,
  cambios: {
    nombre?: string;
    correo?: string;
    telefono?: string;
    region?: string | null;
    monto?: string | null;
    etiqueta?: string | null;
    notas?: string | null;
  }
): Promise<SolicitudCertificacion> {
  const patch: Record<string, string | null> = {};
  if (cambios.nombre !== undefined) patch.nombre = cambios.nombre.trim();
  if (cambios.correo !== undefined) patch.correo = cambios.correo.trim().toLowerCase();
  if (cambios.telefono !== undefined) patch.telefono = cambios.telefono.trim();
  if (cambios.region !== undefined) patch.region = cambios.region?.trim() || null;
  if (cambios.monto !== undefined) patch.monto = cambios.monto?.trim() || null;
  if (cambios.etiqueta !== undefined) patch.etiqueta = cambios.etiqueta?.trim() || null;
  if (cambios.notas !== undefined) patch.notas = cambios.notas?.trim() || null;

  const { data, error } = await supabase
    .from("solicitudes_certificacion")
    .update(patch)
    .eq("id", id)
    .eq("estado", "pendiente")
    .select("*")
    .single();
  if (error) throw error;
  return filaASolicitud(data as SolicitudRow);
}

export async function listarSolicitudesCertificacion(opciones: {
  soloDeUsuario?: string;
  estado?: EstadoSolicitudCertificacion;
}): Promise<SolicitudCertificacion[]> {
  let query = supabase.from("solicitudes_certificacion").select("*").order("creado_en", { ascending: false });
  if (opciones.soloDeUsuario) query = query.eq("solicitado_por_id", opciones.soloDeUsuario);
  if (opciones.estado) query = query.eq("estado", opciones.estado);
  const { data, error } = await query;
  if (error) throw error;
  return (data as SolicitudRow[]).map(filaASolicitud);
}

export async function contarSolicitudesCertificacionPendientes(): Promise<number> {
  const { count, error } = await supabase
    .from("solicitudes_certificacion")
    .select("id", { count: "exact", head: true })
    .eq("estado", "pendiente");
  if (error) throw error;
  return count ?? 0;
}

export async function obtenerSolicitudCertificacion(id: string): Promise<SolicitudCertificacion | null> {
  const { data, error } = await supabase.from("solicitudes_certificacion").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? filaASolicitud(data as SolicitudRow) : null;
}

export async function marcarSolicitudCertificacionAprobada(
  id: string,
  clienteId: string,
  revisadoPor: string
): Promise<SolicitudCertificacion> {
  const { data, error } = await supabase
    .from("solicitudes_certificacion")
    .update({ estado: "aprobada", cliente_id: clienteId, revisado_por: revisadoPor, revisado_en: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return filaASolicitud(data as SolicitudRow);
}

export async function marcarSolicitudCertificacionRechazada(
  id: string,
  nota: string | null,
  revisadoPor: string
): Promise<SolicitudCertificacion> {
  const { data, error } = await supabase
    .from("solicitudes_certificacion")
    .update({ estado: "rechazada", nota_revision: nota, revisado_por: revisadoPor, revisado_en: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return filaASolicitud(data as SolicitudRow);
}
