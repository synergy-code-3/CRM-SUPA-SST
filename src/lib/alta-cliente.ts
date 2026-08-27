import {
  crearCliente,
  marcarAccesoPlataforma,
  marcarInvitacionSkoolEnviada,
  marcarMensajeBienvenidaWa,
  recalcularAccesos,
  registrarOfertaClienteClub,
  registrarTagKajabi,
  vincularKajabiContactId,
} from "@/lib/db";
import { altaEnGhl } from "@/lib/ghl";
import { altaEnKajabi, KAJABI_TAG_MIEMBRO_DEL_CLUB, otorgarOfertaArbitraria } from "@/lib/kajabi";
import { invitarASkool } from "@/lib/skool";
import type { Cliente } from "@/lib/types";

export type AltaClienteInput = {
  nombre: string;
  email: string;
  telefono?: string | null;
  pais?: string | null;
  ciudad?: string | null;
  notas?: string | null;
  evento?: string | null;
  tipoMembresia?: string | null;
  etiqueta?: string | null;
  // Oferta EXTRA (no la del Club) elegida opcionalmente al dar de alta —
  // ver "Agregar oferta" en el panel del cliente para el mismo mecanismo
  // aplicado a un cliente ya existente.
  ofertaAdicionalId?: string | null;
  ofertaAdicionalTitulo?: string | null;
};

export type ResultadoAltaCliente = {
  cliente: Cliente;
  avisoKajabi: string | null;
  avisoSkool: string | null;
  avisoGhl: string | null;
  avisoOfertaAdicional: string | null;
};

// Secuencia completa de dar de alta un cliente: crea la fila en el CRM y,
// como efectos secundarios resilientes (uno no bloquea a los demás), otorga
// el acceso en Kajabi, manda la invitación a Skool y da de alta en GHL para
// disparar el mensaje de bienvenida por WhatsApp. Compartida entre el alta
// directa (POST /api/clientes) y la aprobación de una solicitud
// (POST /api/solicitudes/[id]/aprobar) para no duplicar esta secuencia.
export async function altaCompletaCliente(input: AltaClienteInput, autor: string): Promise<ResultadoAltaCliente> {
  let cliente = await crearCliente({ ...input, autor });

  let avisoKajabi: string | null = null;
  try {
    const kajabiContactId = await altaEnKajabi(cliente.nombre, cliente.email);
    await vincularKajabiContactId(cliente.id, kajabiContactId);
    cliente = await marcarAccesoPlataforma(cliente.id, "Si");
    // Registro inmediato en la timeline: no hay que esperar al
    // sincronizador periódico (cada ~15 min) para saber que esta oferta
    // otorgada es justo la que asigna el tag en Kajabi.
    await registrarTagKajabi(cliente.email, cliente.nombre, KAJABI_TAG_MIEMBRO_DEL_CLUB);
  } catch (err) {
    avisoKajabi = err instanceof Error ? err.message : "No se pudo otorgar el acceso en Kajabi";
  }
  // Fuera del try: cuántos boletos le tocan depende de evento/membresía/
  // fecha (REGLAS-BOLETOS-SYNERGY.md), no de si Kajabi respondió — un
  // cliente recién creado debe quedar calculado igual que uno importado
  // por CSV, sin esperar a que la sincronización de Kajabi funcione.
  cliente = await recalcularAccesos(cliente.id);

  let avisoSkool: string | null = null;
  try {
    await invitarASkool(cliente.email);
    cliente = await marcarInvitacionSkoolEnviada(cliente.id);
  } catch (err) {
    avisoSkool = err instanceof Error ? err.message : "No se pudo enviar la invitación a Skool";
  }

  let avisoGhl: string | null = null;
  try {
    await altaEnGhl(cliente.nombre, cliente.email, cliente.telefono);
  } catch (err) {
    avisoGhl = err instanceof Error ? err.message : "No se pudo dar de alta en GoHighLevel";
  }
  // "Enviado" nunca se escribe aquí — solo confirma que se pidió el envío,
  // no que WhatsApp lo entregó. La única fuente de verdad es el webhook de
  // confirmación real (/api/webhooks/ghl-bienvenida-wa).
  if (cliente.telefono) {
    cliente = await marcarMensajeBienvenidaWa(cliente.id, "Pendiente");
  }

  let avisoOfertaAdicional: string | null = null;
  if (input.ofertaAdicionalId && input.ofertaAdicionalTitulo) {
    try {
      await otorgarOfertaArbitraria(cliente.nombre, cliente.email, input.ofertaAdicionalId);
      await registrarOfertaClienteClub(cliente.id, input.ofertaAdicionalId, input.ofertaAdicionalTitulo, autor);
    } catch (err) {
      avisoOfertaAdicional = err instanceof Error ? err.message : "No se pudo otorgar la oferta adicional";
    }
  }

  return { cliente, avisoKajabi, avisoSkool, avisoGhl, avisoOfertaAdicional };
}
