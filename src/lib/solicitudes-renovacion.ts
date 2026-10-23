// Solicitudes de renovación que llegan del CRM de Renovaciones (sistema
// aparte): nos avisa cuando un cliente inactivo renovó allá, y un admin
// decide aquí si confirmarlo — al aprobar, se dispara EXACTAMENTE el mismo
// flujo que el botón "Renovar" del perfil del cliente (ver renovarMembresia
// en db.ts + otorgarAccesoKajabiYSkool en alta-cliente.ts). Nunca se
// renueva sola con solo recibir la solicitud.
import { supabase } from "./supabase";
import { buscarClientePorCorreo, agregarNota, renovarMembresia } from "./db";
import { otorgarAccesoKajabiYSkool } from "./alta-cliente";
import type { Cliente } from "./types";

export type EstadoSolicitudRenovacion = "pendiente" | "aprobada" | "rechazada";

export type NotaExterna = { texto: string; fecha: string; autor: string };

export type SolicitudRenovacionExterna = {
  id: string;
  solicitudIdExterno: string;
  clienteId: string;
  clienteNombre: string;
  clienteEmail: string | null;
  etiqueta: string;
  renovadoPor: string | null;
  fechaExterna: string | null;
  notasCliente: NotaExterna[];
  estado: EstadoSolicitudRenovacion;
  resueltaPor: string | null;
  resueltaEn: string | null;
  creadoEn: string;
};

type Fila = {
  id: string;
  solicitud_id_externo: string;
  cliente_id: string;
  etiqueta: string;
  renovado_por: string | null;
  fecha_externa: string | null;
  notas_cliente: NotaExterna[] | null;
  estado: EstadoSolicitudRenovacion;
  resuelta_por: string | null;
  resuelta_en: string | null;
  creado_en: string;
  clientes?: { nombre: string; email: string | null } | { nombre: string; email: string | null }[] | null;
};

function filaASolicitud(f: Fila): SolicitudRenovacionExterna {
  const cliente = Array.isArray(f.clientes) ? f.clientes[0] : f.clientes;
  return {
    id: f.id,
    solicitudIdExterno: f.solicitud_id_externo,
    clienteId: f.cliente_id,
    clienteNombre: cliente?.nombre ?? f.cliente_id,
    clienteEmail: cliente?.email ?? null,
    etiqueta: f.etiqueta,
    renovadoPor: f.renovado_por,
    fechaExterna: f.fecha_externa,
    notasCliente: f.notas_cliente ?? [],
    estado: f.estado,
    resueltaPor: f.resuelta_por,
    resueltaEn: f.resuelta_en,
    creadoEn: f.creado_en,
  };
}

const SELECT = "*, clientes(nombre, email)";

export class ErrorClienteNoEncontrado extends Error {
  constructor() {
    super("No se encontró ningún cliente con ese id/correo en este CRM");
  }
}

/**
 * Identifica al cliente por `clienteId` (id del otro sistema, que aquí es el
 * correo normalizado) y, si no existe, por `correo` — y crea (o, si
 * `solicitudIdExterno` ya existía, reutiliza) la solicitud pendiente.
 * Idempotente: un mismo solicitud_id_externo nunca crea dos filas.
 */
export async function crearSolicitudRenovacionExterna(input: {
  solicitudIdExterno: string;
  clienteId: string | null;
  correo: string | null;
  etiqueta: string;
  renovadoPor: string | null;
  fechaExterna: string | null;
  notasCliente: NotaExterna[];
}): Promise<SolicitudRenovacionExterna> {
  let cliente: Cliente | null = null;
  if (input.clienteId) cliente = await buscarClientePorCorreo(input.clienteId);
  if (!cliente && input.correo) cliente = await buscarClientePorCorreo(input.correo);
  if (!cliente) throw new ErrorClienteNoEncontrado();

  const { data, error } = await supabase
    .from("solicitudes_renovacion_externa")
    .upsert(
      {
        solicitud_id_externo: input.solicitudIdExterno,
        cliente_id: cliente.id,
        etiqueta: input.etiqueta,
        renovado_por: input.renovadoPor,
        fecha_externa: input.fechaExterna,
        notas_cliente: input.notasCliente,
      },
      { onConflict: "solicitud_id_externo" }
    )
    .select(SELECT)
    .single();
  if (error) throw error;

  await agregarNota(
    cliente.id,
    `Solicitud de renovación recibida del CRM de Renovaciones (etiqueta: ${input.etiqueta}${input.renovadoPor ? `, marcada por ${input.renovadoPor}` : ""}). Pendiente de aprobar en Solicitudes.`,
    "CRM Renovaciones"
  ).catch(() => {
    // Best-effort: si la nota falla, la solicitud ya quedó creada igual —
    // no vale la pena tirar un 500 al otro sistema por esto.
  });

  return filaASolicitud(data as Fila);
}

export async function listarSolicitudesRenovacionExterna(): Promise<SolicitudRenovacionExterna[]> {
  const { data, error } = await supabase
    .from("solicitudes_renovacion_externa")
    .select(SELECT)
    .order("creado_en", { ascending: false });
  if (error) throw error;
  return (data as Fila[]).map(filaASolicitud);
}

async function obtenerFila(id: string): Promise<Fila> {
  const { data, error } = await supabase.from("solicitudes_renovacion_externa").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Solicitud no encontrada");
  return data as Fila;
}

/** Aprobar = exactamente lo mismo que el botón "Renovar" del perfil del cliente. */
export async function aprobarSolicitudRenovacionExterna(id: string, autor: string): Promise<void> {
  const fila = await obtenerFila(id);
  if (fila.estado !== "pendiente") throw new Error("Esta solicitud ya fue resuelta");

  const cliente = await renovarMembresia(fila.cliente_id, autor);
  await otorgarAccesoKajabiYSkool(cliente);

  const { error } = await supabase
    .from("solicitudes_renovacion_externa")
    .update({ estado: "aprobada", resuelta_por: autor, resuelta_en: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function rechazarSolicitudRenovacionExterna(id: string, autor: string): Promise<void> {
  const fila = await obtenerFila(id);
  if (fila.estado !== "pendiente") throw new Error("Esta solicitud ya fue resuelta");

  const { error } = await supabase
    .from("solicitudes_renovacion_externa")
    .update({ estado: "rechazada", resuelta_por: autor, resuelta_en: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
