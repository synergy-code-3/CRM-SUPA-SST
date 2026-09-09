import { NextRequest, NextResponse } from "next/server";
import { crearAvisoAutomatico } from "@/lib/avisos";
import { autorizadoParaCron } from "@/lib/cron-auth";
import {
  correosSinClienteAun,
  guardarCursorSyncKajabi,
  marcarInvitacionSkoolEnviada,
  marcarMensajeBienvenidaWa,
  normalizarEmail,
  obtenerCursorSyncKajabi,
  reconciliarOfertasVencidas,
  registrarTagKajabi,
  reintentarCompletadoAxis,
} from "@/lib/db";
import { altaEnGhl } from "@/lib/ghl";
import { KAJABI_OFFER_ID_CLUB_SINERGETICO, KAJABI_TAG_MIEMBRO_DEL_CLUB, nuevosConOfertaDesde } from "@/lib/kajabi";
import { invitarASkool } from "@/lib/skool";

export const maxDuration = 60;

// Un cliente detectado hace menos de esto se deja para la siguiente corrida
// en vez de buscarle teléfono de una vez — le da tiempo al webhook de
// Hotmart (que suele llegar casi al instante, pero no está garantizado) a
// dejarlo listo en hotmart_pendientes antes de que se le busque.
const RETRASO_MINIMO_MS = 60_000;

// Ventana del barrido de seguridad de abajo (ver comentario ahí) — acotada
// a propósito: hay ~250,000 contactos históricos con esta oferta por el
// error masivo de antes del CRM, así que no se puede barrer todo cada vez.
const VENTANA_BARRIDO_DIAS = 7;

// Da de alta (o solo tagea si ya existe) un contacto que Kajabi confirma
// con la oferta — mismo trato que un alta manual: Skool + GHL solo si es
// de verdad nuevo. Compartido por el barrido normal (por cursor) y el
// barrido de seguridad (por ventana fija, ver abajo).
async function procesarAltaKajabi(c: { email: string; nombre: string }): Promise<boolean> {
  const { cliente, esNuevo } = await registrarTagKajabi(c.email, c.nombre, KAJABI_TAG_MIEMBRO_DEL_CLUB);

  // Compras que Kajabi detecta solo (típicamente vía su integración con
  // Hotmart) no pasaban por el alta normal del CRM, así que nunca recibían
  // la invitación de Skool ni el WhatsApp de bienvenida. Un cliente nuevo
  // aquí merece el mismo trato que uno dado de alta a mano.
  if (esNuevo) {
    try {
      await invitarASkool(cliente.email);
      await marcarInvitacionSkoolEnviada(cliente.id);
    } catch {
      // Best-effort: no bloquea el resto de la sincronización.
    }

    if (cliente.telefono) {
      // "Enviado" nunca se escribe aquí — solo el webhook de confirmación
      // real (/api/webhooks/ghl-bienvenida-wa) lo hace, cuando GHL avisa
      // que WhatsApp de verdad lo entregó.
      try {
        await altaEnGhl(cliente.nombre, cliente.email, cliente.telefono);
      } catch {
        // Best-effort: no bloquea el resto de la sincronización.
      }
      await marcarMensajeBienvenidaWa(cliente.id, "Pendiente");
    }
  }
  return esNuevo;
}

// Reemplaza al webhook nativo de Kajabi (sin permiso disponible para esta
// cuenta): se consulta activamente quién tiene la oferta otorgada desde la
// última corrida. En la primera corrida NO se procesa nada existente — solo
// se establece "ahora" como punto de partida — para no arrastrar altas
// viejas (incluye un error histórico donde se le otorgó la oferta a
// contactos que nunca compraron nada). Invocado cada ~15 min por el Cron
// Job de Vercel (ver vercel.json) — el cron de GitHub Actions que se usaba
// antes no era confiable para intervalos cortos (podía tardar horas en
// dispararse), se dejó solo como respaldo manual.
async function manejar(req: NextRequest) {
  if (!autorizadoParaCron(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const cursor = await obtenerCursorSyncKajabi();
  if (!cursor) {
    await guardarCursorSyncKajabi(new Date().toISOString());
    return NextResponse.json({ ok: true, procesados: 0, nota: "cursor inicial establecido" });
  }

  const ahora = Date.now();
  const todos = await nuevosConOfertaDesde(KAJABI_OFFER_ID_CLUB_SINERGETICO, cursor);
  // Vienen del más viejo al más nuevo, así que en cuanto uno es demasiado
  // reciente, todos los que siguen también lo son — se cortan aquí y quedan
  // para la próxima corrida (no se pierden: el cursor solo avanza hasta el
  // último realmente procesado).
  const primerRetrasadoIdx = todos.findIndex((c) => ahora - new Date(c.creadoEn).getTime() < RETRASO_MINIMO_MS);
  const nuevos = primerRetrasadoIdx === -1 ? todos : todos.slice(0, primerRetrasadoIdx);

  let procesados = 0;
  let ultimoProcesado: string | null = null;
  for (const c of nuevos) {
    try {
      await procesarAltaKajabi(c);
      procesados++;
      ultimoProcesado = c.creadoEn;
    } catch (err) {
      // registrarTagKajabi puede fallar por rate-limiting de Kajabi si esta
      // corrida tiene muchas altas nuevas de golpe (mismo problema que tuvo
      // el backfill inicial con 158 clientes de un jalón). En vez de tronar
      // toda la función (y perder el progreso de los que sí se alcanzaron a
      // procesar), se corta aquí: el cursor avanza solo hasta el último
      // cliente realmente procesado, y los que quedaron pendientes se
      // recogen en la siguiente corrida del cron (~15 min) sin duplicar
      // nada — registrarTagKajabi es idempotente si un cliente ya existe.
      console.error("Sincronización de Kajabi interrumpida, se reintentará en la siguiente corrida:", err);
      break;
    }
  }
  if (ultimoProcesado) {
    await guardarCursorSyncKajabi(ultimoProcesado);
  }

  // Reintento best-effort: clientes creados recientemente que se quedaron
  // sin evento/tipo de membresía porque Axis todavía no tenía su compra
  // registrada en el momento de la creación (carrera entre Kajabi y Axis) —
  // ver reintentarCompletadoAxis(). No bloquea la respuesta si falla.
  let axis: { revisados: number; completados: number } | null = null;
  try {
    axis = await reintentarCompletadoAxis();
  } catch (err) {
    console.error("Reintento de Axis falló, se reintenta en la siguiente corrida:", err);
  }

  // Reconciliación best-effort: clientes vencidos que Kajabi ya muestra con
  // la oferta otra vez (renovaron por un canal que no dispara el webhook de
  // Hotmart) — ver reconciliarOfertasVencidas(). Si encontró alguno, se
  // publica un solo aviso agrupando todos (no uno por cliente, para no
  // saturar Avisos con la ventana emergente si un día se reactivan varios).
  let reconciliacion: { revisados: number; reactivados: number } | null = null;
  try {
    const resultado = await reconciliarOfertasVencidas();
    reconciliacion = { revisados: resultado.revisados, reactivados: resultado.reactivados.length };
    if (resultado.reactivados.length > 0) {
      const lista = resultado.reactivados
        .map((r) => `• ${r.nombre} (${r.email}) — Fin de acceso: ${r.finAcceso}`)
        .join("\n");
      await crearAvisoAutomatico(
        "Reactivaciones automáticas de Kajabi",
        `Kajabi ya muestra la oferta del Club otorgada otra vez a estos clientes vencidos (renovaron por fuera del CRM) — se les reactivó el acceso automáticamente:\n\n${lista}`,
        true
      );
    }
  } catch (err) {
    console.error("Reconciliación de ofertas vencidas falló, se reintenta en la siguiente corrida:", err);
  }

  // Barrido de seguridad best-effort: el cursor de arriba avanza según la
  // fecha de CREACIÓN del contacto en Kajabi, pero la oferta a veces se le
  // otorga horas o días después de creado (confirmado con
  // naturabeauty30@gmail.com, 8-9/sep/2026: contacto creado, oferta
  // otorgada ~9h más tarde, para entonces el cursor ya había avanzado más
  // allá de su fecha de creación por otros contactos más rápidos) — esos
  // quedan saltados para siempre, porque nunca vuelven a aparecer
  // "después del cursor". Este barrido no usa cursor: siempre re-revisa
  // una ventana fija de los últimos VENTANA_BARRIDO_DIAS días buscando a
  // quien tenga la oferta y siga sin cliente en el CRM — procesarAltaKajabi
  // es idempotente, así que revisar de más a los que el barrido normal ya
  // atrapó en esta misma corrida no hace daño, solo es un poco redundante.
  let barrido: { revisados: number; procesados: number } | null = null;
  try {
    const desdeBarrido = new Date(ahora - VENTANA_BARRIDO_DIAS * 24 * 60 * 60 * 1000).toISOString();
    const enVentana = await nuevosConOfertaDesde(KAJABI_OFFER_ID_CLUB_SINERGETICO, desdeBarrido);
    // Evita reprocesar en la misma corrida a quien ya atrapó el barrido
    // normal de arriba (no sería incorrecto, procesarAltaKajabi es
    // idempotente, pero sí desperdicia llamadas a Kajabi/Supabase de más en
    // cada corrida, no solo en el caso raro que este barrido existe para
    // cubrir).
    const yaVistos = new Set(nuevos.map((c) => c.email));
    const candidatos = enVentana.filter(
      (c) => !yaVistos.has(c.email) && ahora - new Date(c.creadoEn).getTime() >= RETRASO_MINIMO_MS
    );
    // La ventana de 7 días trae cientos de contactos (la mayoría ya
    // procesados en corridas anteriores) — llamar registrarTagKajabi por
    // cada uno (una consulta a Supabase por correo) tardaba varios minutos
    // y se pasaba del límite de 60s del cron en Vercel. Un solo filtro por
    // lote descarta a los que ya son clientes antes de tocar el camino caro
    // — solo quedan los realmente nuevos, que son pocos.
    const sinCliente = await correosSinClienteAun(candidatos.map((c) => c.email));
    const listosParaProcesar = candidatos.filter((c) => sinCliente.has(normalizarEmail(c.email)));
    let procesadosBarrido = 0;
    for (const c of listosParaProcesar) {
      try {
        if (await procesarAltaKajabi(c)) procesadosBarrido++;
      } catch (err) {
        console.error(`Barrido de altas recientes: falló ${c.email}, se reintenta en la siguiente corrida:`, err);
      }
    }
    barrido = { revisados: listosParaProcesar.length, procesados: procesadosBarrido };
  } catch (err) {
    console.error("Barrido de altas recientes falló, se reintenta en la siguiente corrida:", err);
  }

  return NextResponse.json({ ok: true, procesados, detectados: nuevos.length, axis, reconciliacion, barrido });
}

export const GET = manejar;
export const POST = manejar;
