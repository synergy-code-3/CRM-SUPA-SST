import { supabase } from "@/lib/supabase";
import type { EstadoSolicitudUpgrade, SolicitudUpgradeMembresia } from "@/lib/types";

type SolicitudUpgradeRow = {
  id: string;
  cliente_id: string;
  membresia_actual: string;
  comprobantes: string[] | null;
  notas: string | null;
  estado: EstadoSolicitudUpgrade;
  solicitado_por_id: string;
  solicitado_por_nombre: string;
  nota_revision: string | null;
  revisado_por: string | null;
  revisado_en: string | null;
  creado_en: string;
};

function filaASolicitud(row: SolicitudUpgradeRow): SolicitudUpgradeMembresia {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    membresiaActual: row.membresia_actual,
    comprobantes: row.comprobantes ?? [],
    notas: row.notas,
    estado: row.estado,
    solicitadoPorId: row.solicitado_por_id,
    solicitadoPorNombre: row.solicitado_por_nombre,
    notaRevision: row.nota_revision,
    revisadoPor: row.revisado_por,
    revisadoEn: row.revisado_en,
    creadoEn: row.creado_en,
  };
}

export async function crearSolicitudUpgrade(input: {
  id: string;
  clienteId: string;
  membresiaActual: string;
  comprobantes: string[];
  notas?: string | null;
  solicitadoPorId: string;
  solicitadoPorNombre: string;
}): Promise<SolicitudUpgradeMembresia> {
  const { data, error } = await supabase
    .from("solicitudes_upgrade_membresia")
    .insert({
      id: input.id,
      cliente_id: input.clienteId,
      membresia_actual: input.membresiaActual,
      comprobantes: input.comprobantes,
      notas: input.notas?.trim() || null,
      solicitado_por_id: input.solicitadoPorId,
      solicitado_por_nombre: input.solicitadoPorNombre,
    })
    .select("*")
    .single();
  if (error) throw error;
  return filaASolicitud(data as SolicitudUpgradeRow);
}

// Para el perfil del cliente: su solicitud pendiente (si hay una) para
// mostrar el botón o la tarjeta de revisión según corresponda. Como mucho
// hay una pendiente a la vez por cliente (no se deja mandar una segunda
// mientras otra siga sin resolver, ver POST del endpoint).
export async function obtenerSolicitudUpgradePendiente(clienteId: string): Promise<SolicitudUpgradeMembresia | null> {
  const { data, error } = await supabase
    .from("solicitudes_upgrade_membresia")
    .select("*")
    .eq("cliente_id", clienteId)
    .eq("estado", "pendiente")
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? filaASolicitud(data as SolicitudUpgradeRow) : null;
}

export async function obtenerSolicitudUpgrade(id: string): Promise<SolicitudUpgradeMembresia | null> {
  const { data, error } = await supabase.from("solicitudes_upgrade_membresia").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? filaASolicitud(data as SolicitudUpgradeRow) : null;
}

export async function marcarSolicitudUpgradeAprobada(id: string, revisadoPor: string): Promise<SolicitudUpgradeMembresia> {
  const { data, error } = await supabase
    .from("solicitudes_upgrade_membresia")
    .update({ estado: "aprobada", revisado_por: revisadoPor, revisado_en: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return filaASolicitud(data as SolicitudUpgradeRow);
}

export async function marcarSolicitudUpgradeRechazada(
  id: string,
  nota: string | null,
  revisadoPor: string
): Promise<SolicitudUpgradeMembresia> {
  const { data, error } = await supabase
    .from("solicitudes_upgrade_membresia")
    .update({ estado: "rechazada", nota_revision: nota, revisado_por: revisadoPor, revisado_en: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return filaASolicitud(data as SolicitudUpgradeRow);
}
