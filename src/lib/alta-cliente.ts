import {
  crearCliente,
  marcarAccesoPlataforma,
  marcarInvitacionSkoolEnviada,
  marcarMensajeBienvenidaWa,
  normalizarEmail,
  obtenerCliente,
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

// Secuencia completa de dar de alta un cliente. Kajabi va PRIMERO y es
// bloqueante a propósito (a diferencia de Skool/GHL más abajo, que sí son
// efectos secundarios resilientes): si no se le puede dar la oferta —correo
// inválido, ya la tiene, error de Kajabi, lo que sea— esta función lanza el
// error tal cual y NO se crea nada en el CRM, ni se manda invitación a
// Skool ni mensaje de bienvenida. Evita registros "fantasma" de gente que
// en realidad no tiene acceso real. Compartida entre el alta directa
// (POST /api/clientes) y la aprobación de una solicitud
// (POST /api/solicitudes/[id]/aprobar) para no duplicar esta secuencia.
export async function altaCompletaCliente(input: AltaClienteInput, autor: string): Promise<ResultadoAltaCliente> {
  // Chequeo barato antes de tocar Kajabi: si el cliente ya existe, no tiene
  // caso gastar una llamada real a Kajabi para descubrirlo después —
  // crearCliente() vuelve a checarlo de todos modos, por si hay una
  // condición de carrera entre este chequeo y el insert real.
  const yaExiste = await obtenerCliente(normalizarEmail(input.email));
  if (yaExiste) throw new Error("Ya existe un cliente con ese correo");

  const kajabiContactId = await altaEnKajabi(input.nombre, input.email);

  let cliente = await crearCliente({ ...input, autor });
  await vincularKajabiContactId(cliente.id, kajabiContactId);
  cliente = await marcarAccesoPlataforma(cliente.id, "Si");
  // Registro inmediato en la timeline: no hay que esperar al sincronizador
  // periódico (cada ~15 min) para saber que esta oferta otorgada es justo
  // la que asigna el tag en Kajabi.
  await registrarTagKajabi(cliente.email, cliente.nombre, KAJABI_TAG_MIEMBRO_DEL_CLUB);
  // Cuántos boletos le tocan depende de evento/membresía/fecha (REGLAS-
  // BOLETOS-SYNERGY.md) — se calcula ya con el acceso a Kajabi confirmado.
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

  // avisoKajabi siempre null aquí: si Kajabi hubiera fallado, la función ya
  // habría lanzado el error arriba, antes de crear nada — se deja en la
  // forma de retorno solo para no romper a quien la consume (UI de
  // importación, etc.), que ya sabe mostrar "OK" cuando viene en null.
  return { cliente, avisoKajabi: null, avisoSkool, avisoGhl, avisoOfertaAdicional };
}
