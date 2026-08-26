import { supabase } from "@/lib/supabase";
import type { EstadoSolicitud, SolicitudCliente } from "@/lib/types";

type SolicitudRow = {
  id: string;
  nombre: string;
  correo_pago: string;
  correo_acceso: string;
  telefono: string;
  pais: string | null;
  evento: string;
  tipo_membresia: string;
  comprobantes: string[] | null;
  estado: EstadoSolicitud;
  solicitado_por_id: string;
  solicitado_por_nombre: string;
  nota_revision: string | null;
  revisado_por: string | null;
  revisado_en: string | null;
  cliente_id: string | null;
  creado_en: string;
};

function filaASolicitud(row: SolicitudRow): SolicitudCliente {
  return {
    id: row.id,
    nombre: row.nombre,
    correoPago: row.correo_pago,
    correoAcceso: row.correo_acceso,
    telefono: row.telefono,
    pais: row.pais,
    evento: row.evento,
    tipoMembresia: row.tipo_membresia,
    comprobantes: row.comprobantes ?? [],
    estado: row.estado,
    solicitadoPorId: row.solicitado_por_id,
    solicitadoPorNombre: row.solicitado_por_nombre,
    notaRevision: row.nota_revision,
    revisadoPor: row.revisado_por,
    revisadoEn: row.revisado_en,
    clienteId: row.cliente_id,
    creadoEn: row.creado_en,
  };
}

export async function crearSolicitud(input: {
  id: string;
  nombre: string;
  correoPago: string;
  correoAcceso: string;
  telefono: string;
  pais?: string | null;
  evento: string;
  tipoMembresia: string;
  comprobantes: string[];
  solicitadoPorId: string;
  solicitadoPorNombre: string;
}): Promise<SolicitudCliente> {
  const { data, error } = await supabase
    .from("solicitudes_cliente")
    .insert({
      id: input.id,
      nombre: input.nombre.trim(),
      correo_pago: input.correoPago.trim().toLowerCase(),
      correo_acceso: input.correoAcceso.trim().toLowerCase(),
      telefono: input.telefono.trim(),
      pais: input.pais?.trim() || null,
      evento: input.evento.trim(),
      tipo_membresia: input.tipoMembresia.trim(),
      comprobantes: input.comprobantes,
      solicitado_por_id: input.solicitadoPorId,
      solicitado_por_nombre: input.solicitadoPorNombre,
    })
    .select("*")
    .single();
  if (error) throw error;
  return filaASolicitud(data as SolicitudRow);
}

export async function listarSolicitudes(opciones: {
  soloDeUsuario?: string;
  estado?: EstadoSolicitud;
}): Promise<SolicitudCliente[]> {
  let query = supabase.from("solicitudes_cliente").select("*").order("creado_en", { ascending: false });
  if (opciones.soloDeUsuario) query = query.eq("solicitado_por_id", opciones.soloDeUsuario);
  if (opciones.estado) query = query.eq("estado", opciones.estado);
  const { data, error } = await query;
  if (error) throw error;
  return (data as SolicitudRow[]).map(filaASolicitud);
}

// Para la burbuja de "Solicitudes" en el menú lateral — head:true, sin
// traer las filas (ni sus comprobantes), solo el conteo.
export async function contarSolicitudesPendientes(): Promise<number> {
  const { count, error } = await supabase
    .from("solicitudes_cliente")
    .select("id", { count: "exact", head: true })
    .eq("estado", "pendiente");
  if (error) throw error;
  return count ?? 0;
}

export async function obtenerSolicitud(id: string): Promise<SolicitudCliente | null> {
  const { data, error } = await supabase.from("solicitudes_cliente").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? filaASolicitud(data as SolicitudRow) : null;
}

export async function marcarSolicitudAprobada(
  id: string,
  clienteId: string,
  revisadoPor: string
): Promise<SolicitudCliente> {
  const { data, error } = await supabase
    .from("solicitudes_cliente")
    .update({
      estado: "aprobada",
      cliente_id: clienteId,
      revisado_por: revisadoPor,
      revisado_en: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return filaASolicitud(data as SolicitudRow);
}

export async function marcarSolicitudRechazada(
  id: string,
  nota: string | null,
  revisadoPor: string
): Promise<SolicitudCliente> {
  const { data, error } = await supabase
    .from("solicitudes_cliente")
    .update({
      estado: "rechazada",
      nota_revision: nota,
      revisado_por: revisadoPor,
      revisado_en: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return filaASolicitud(data as SolicitudRow);
}
