import { randomUUID } from "crypto";
import { supabase } from "./supabase";
import { hashPassword } from "./auth";
import { obtenerCliente } from "./db";
import { crearSolicitud, obtenerSolicitudPorLeadVsl } from "./solicitudes";
import { obtenerClienteCertificacion } from "./certificaciones";
import { crearSolicitudCertificacion, obtenerSolicitudCertificacionPorLeadVsl } from "./solicitudes-certificacion";
import { REGIONES_CERTIFICACION, type RegionCertificacion } from "./certificaciones-tipos";
import { subirComprobante } from "./storage";
import { listarTodosConvertidosVsl, marcarAccesoDadoVsl, type ConvertidoVsl } from "./vsl-soporte";

// Cuenta "usuario" fija que aparece como autor de las solicitudes creadas
// solas — no tiene contraseña real utilizable (password_hash es un
// aleatorio desechable) ni queda activa, así que no se puede iniciar
// sesión con ella. Se crea sola la primera vez que hace falta.
const CORREO_USUARIO_SYNC = "sync-vsl@sistema.interno";
const NOMBRE_USUARIO_SYNC = "Sincronización VSL";

async function usuarioSyncId(): Promise<string> {
  const { data: existente, error: errLectura } = await supabase
    .from("usuarios")
    .select("id")
    .eq("email", CORREO_USUARIO_SYNC)
    .maybeSingle();
  if (errLectura) throw errLectura;
  if (existente) return existente.id as string;

  const password_hash = await hashPassword(randomUUID());
  const { data, error } = await supabase
    .from("usuarios")
    .insert({
      nombre: NOMBRE_USUARIO_SYNC,
      email: CORREO_USUARIO_SYNC,
      password_hash,
      rol: "admin",
      activo: false,
      primera_aprobacion_en: new Date().toISOString(), // no es un autoregistro real, que no cuente como pendiente
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

// Adivina el evento/país a partir del código de país del teléfono — último
// respaldo, solo cuando VSL no reportó evento/tipoMembresia (formulario
// viejo) NI se pudo detectar por monto/moneda (venta "sin registrar"). El
// admin puede corregirlo antes de aprobar si adivinó mal (ver
// editarSolicitud). Los 3 eventos ("VSL MX/USA/LATAM") ya están en el
// catálogo de Biblioteca y en Asignacion de boletos.csv (1/2/3 VIP MX +
// 1/2/3 VIP US para 3/6/12 meses, igual sin importar la región).
function inferirEventoYPaisDesdeTelefono(telefono: string | null): { evento: string; pais: string | null } {
  const limpio = (telefono ?? "").replace(/[^\d+]/g, "");
  if (limpio.startsWith("+52")) return { evento: "VSL MX", pais: "México" };
  if (limpio.startsWith("+1")) return { evento: "VSL USA", pais: "Estados Unidos" };
  return { evento: "VSL LATAM", pais: null };
}

function paisDesdeEventoVsl(evento: string): string | null {
  if (evento === "VSL MX") return "México";
  if (evento === "VSL USA") return "Estados Unidos";
  return null; // VSL LATAM: abarca varios países, no hay uno solo que asignar
}

const EVENTOS_VSL_VALIDOS = ["VSL MX", "VSL USA", "VSL LATAM"];
const TIPOS_MEMBRESIA_VALIDOS = ["3 Meses", "6 Meses", "12 Meses"];

// De dónde salió el evento/región de una solicitud creada por la sync:
//  - "reportado": el vendedor de VSL lo eligió en su propio formulario
//    (mismo selector que el nuestro) — la fuente más confiable, no hace
//    falta advertir nada al revisor.
//  - "detectado": no vino del formulario, pero el monto/moneda coincidió
//    exacto con una tarifa conocida (PRECIOS_VSL/PRECIOS_CERTIFICACION).
//  - "adivinado": último respaldo, por el código de país del teléfono —
//    el único caso que de verdad necesita revisión antes de aprobar.
type OrigenDato = "reportado" | "detectado" | "adivinado";

// VSL vende tanto Club Sinergético como Certificaciones (Legendar-IA) por el
// mismo endpoint — el campo "producto" es la única señal, y son solo estas
// dos cadenas reales confirmadas contra la API en vivo ("Club Sinergético" /
// "Certificación LEGENDAR·IA"). Cualquier otra cosa (o null) cae a Club por
// default, mismo comportamiento que ya existía antes de esta distinción.
function esVentaDeCertificacion(producto: string | null | undefined): boolean {
  return /legendar/i.test(producto ?? "");
}

// Mismo respaldo que inferirEventoYPaisDesdeTelefono, pero devolviendo una
// región de Certificaciones en vez de un evento del Club — se usa solo
// cuando detectarRegionCertificacionDesdeMontoYMoneda no encuentra el
// monto (ventas "sin registrar"); el admin confirma región/monto al revisar.
function inferirRegionCertificacionDesdeTelefono(telefono: string | null): RegionCertificacion {
  const limpio = (telefono ?? "").replace(/[^\d+]/g, "");
  if (limpio.startsWith("+52")) return "MX";
  if (limpio.startsWith("+1")) return "US";
  return "LATAM";
}

// Tabla de precios de Legendar-IA (monto + moneda → región) — mismos montos
// que la tabla de 3 meses de PRECIOS_VSL a propósito (es el mismo precio de
// entrada para ambos productos), pero esVentaDeCertificacion ya separó la
// rama antes de llegar aquí, así que no hay ambigüedad real. Certificaciones
// no tiene duración de membresía (a diferencia del Club), por eso esta tabla
// no lleva tipoMembresia — solo región.
const PRECIOS_CERTIFICACION: { moneda: string; monto: number; region: RegionCertificacion }[] = [
  { moneda: "usd", monto: 997, region: "US" },
  { moneda: "mxn", monto: 9997, region: "MX" },
  { moneda: "usd", monto: 599, region: "LATAM" },
];

function detectarRegionCertificacionDesdeMontoYMoneda(
  monto: number | null,
  moneda: string | null
): RegionCertificacion | null {
  if (monto == null || !moneda) return null;
  const monedaKey = moneda.trim().toLowerCase();
  const montoRedondeado = Math.round(monto);
  return PRECIOS_CERTIFICACION.find((p) => p.moneda === monedaKey && p.monto === montoRedondeado)?.region ?? null;
}

// Tabla de precios que mandó el director de VSL (monto + moneda → región +
// duración de membresía) — mucho más confiable que adivinar por el código
// de país del teléfono, porque viene directo de lo que Stripe cobró.
const PRECIOS_VSL: { moneda: string; monto: number; evento: string; pais: string | null; tipoMembresia: string }[] = [
  { moneda: "usd", monto: 997, evento: "VSL USA", pais: "Estados Unidos", tipoMembresia: "3 Meses" },
  { moneda: "usd", monto: 1299, evento: "VSL USA", pais: "Estados Unidos", tipoMembresia: "6 Meses" },
  { moneda: "usd", monto: 1499, evento: "VSL USA", pais: "Estados Unidos", tipoMembresia: "12 Meses" },
  { moneda: "mxn", monto: 9997, evento: "VSL MX", pais: "México", tipoMembresia: "3 Meses" },
  { moneda: "mxn", monto: 12997, evento: "VSL MX", pais: "México", tipoMembresia: "6 Meses" },
  { moneda: "mxn", monto: 14997, evento: "VSL MX", pais: "México", tipoMembresia: "12 Meses" },
  { moneda: "usd", monto: 599, evento: "VSL LATAM", pais: null, tipoMembresia: "3 Meses" },
  { moneda: "usd", monto: 799, evento: "VSL LATAM", pais: null, tipoMembresia: "6 Meses" },
  { moneda: "usd", monto: 999, evento: "VSL LATAM", pais: null, tipoMembresia: "12 Meses" },
];

const TIPO_MEMBRESIA_DEFAULT = "12 Meses";

function detectarDesdeMontoYMoneda(
  monto: number | null,
  moneda: string | null
): { evento: string; pais: string | null; tipoMembresia: string } | null {
  if (monto == null || !moneda) return null;
  const monedaKey = moneda.trim().toLowerCase();
  const montoRedondeado = Math.round(monto);
  return PRECIOS_VSL.find((p) => p.moneda === monedaKey && p.monto === montoRedondeado) ?? null;
}

function notaParaRevisor(c: ConvertidoVsl, origen: OrigenDato): string {
  const partes = [
    origen === "reportado"
      ? `Elegido por el vendedor de VSL en su formulario — producto: "${c.producto}"`
      : `Detectado automático desde VSL — producto: "${c.producto}"`,
    c.vendedor ? `vendedor: ${c.vendedor}` : null,
    c.monto != null ? `monto: ${c.monto}${c.moneda ? ` ${c.moneda}` : ""}` : null,
    `fuente: ${c.fuenteVenta}`,
    c.fechaVenta ? `vendido el ${new Date(c.fechaVenta).toLocaleDateString("es-MX")}` : null,
    origen === "adivinado"
      ? "⚠ El vendedor de VSL no reportó el dato y no se pudo detectar por monto — adivinado por el código de país del teléfono, verificar antes de aprobar"
      : null,
  ].filter(Boolean);
  return partes.join(" · ") + (c.notas ? `\nNotas de VSL: ${c.notas}` : "");
}

// Descarga el comprobante de VSL (URL firmada de ellos, expira en minutos)
// y lo vuelve a subir a nuestro propio bucket privado — así queda
// disponible para revisión aunque el admin tarde en revisar la solicitud.
async function reubicarComprobante(solicitudId: string, url: string): Promise<string[]> {
  const res = await fetch(url);
  if (!res.ok) return [];
  const buffer = Buffer.from(await res.arrayBuffer());
  const tipo = res.headers.get("content-type") ?? "application/octet-stream";
  const extension = tipo.includes("pdf") ? "pdf" : tipo.includes("png") ? "png" : "jpg";
  const archivo = new File([buffer], `comprobante-vsl.${extension}`, { type: tipo });
  const ruta = await subirComprobante(solicitudId, archivo);
  return [ruta];
}

export type ResultadoSincronizarVsl = {
  creadas: number;
  yaEranClientes: number; // detectado como cliente existente — se le avisa a VSL directo, sin crear solicitud
  saltadas: number; // ya tenían solicitud, o ya estaban marcadas accesoDado
  errores: number;
};

// Un mismo lead puede haber quedado con una solicitud pendiente en el Club
// (ruteo viejo, antes de esVentaDeCertificacion) y, en una corrida
// posterior ya con el ruteo nuevo, procesarse otra vez y crear OTRA
// solicitud en Certificaciones — cada rama solo revisaba su propia tabla,
// nunca la otra. Pasó de verdad con antonellaluzo@gmail.com (10-sep-2026).
// Se revisan ambas tablas antes de crear cualquier solicitud nueva.
async function yaExisteSolicitudVsl(leadId: string): Promise<boolean> {
  const [enClub, enCertificacion] = await Promise.all([
    obtenerSolicitudPorLeadVsl(leadId),
    obtenerSolicitudCertificacionPorLeadVsl(leadId),
  ]);
  return !!enClub || !!enCertificacion;
}

export async function sincronizarSolicitudesVsl(): Promise<ResultadoSincronizarVsl> {
  const convertidos = await listarTodosConvertidosVsl();
  const resultado: ResultadoSincronizarVsl = { creadas: 0, yaEranClientes: 0, saltadas: 0, errores: 0 };

  for (const c of convertidos) {
    if (c.accesoDado) {
      resultado.saltadas++;
      continue;
    }

    try {
      if (esVentaDeCertificacion(c.producto)) {
        await procesarConversionCertificacion(c, resultado);
      } else {
        await procesarConversionClub(c, resultado);
      }
    } catch {
      resultado.errores++;
    }
  }

  return resultado;
}

async function procesarConversionClub(c: ConvertidoVsl, resultado: ResultadoSincronizarVsl): Promise<void> {
  // Si el correo ya es cliente aquí (alta manual, u otra vía), no hace
  // falta pasar por Solicitudes — solo se le avisa a VSL que ya tiene
  // acceso, para que deje de aparecer como pendiente de su lado.
  const clienteExistente = await obtenerCliente(c.email.trim().toLowerCase());
  if (clienteExistente) {
    await marcarAccesoDadoVsl(c.leadId);
    resultado.yaEranClientes++;
    return;
  }

  if (await yaExisteSolicitudVsl(c.leadId)) {
    resultado.saltadas++;
    return;
  }

  const solicitudId = randomUUID();

  const eventoReportado = c.evento && EVENTOS_VSL_VALIDOS.includes(c.evento) ? c.evento : null;
  const tipoMembresiaReportada =
    c.tipoMembresia && TIPOS_MEMBRESIA_VALIDOS.includes(c.tipoMembresia) ? c.tipoMembresia : null;

  let evento: string;
  let pais: string | null;
  let tipoMembresia: string;
  let origen: OrigenDato;

  if (eventoReportado && tipoMembresiaReportada) {
    evento = eventoReportado;
    pais = paisDesdeEventoVsl(eventoReportado);
    tipoMembresia = tipoMembresiaReportada;
    origen = "reportado";
  } else {
    const detectado = detectarDesdeMontoYMoneda(c.monto, c.moneda);
    if (detectado) {
      evento = detectado.evento;
      pais = detectado.pais;
      tipoMembresia = detectado.tipoMembresia;
      origen = "detectado";
    } else {
      const inferido = inferirEventoYPaisDesdeTelefono(c.telefono);
      evento = inferido.evento;
      pais = inferido.pais;
      tipoMembresia = TIPO_MEMBRESIA_DEFAULT;
      origen = "adivinado";
    }
  }

  const comprobantes = c.comprobanteUrl ? await reubicarComprobante(solicitudId, c.comprobanteUrl) : [];

  await crearSolicitud({
    id: solicitudId,
    nombre: c.nombre,
    correoPago: c.email,
    correoAcceso: c.email,
    telefono: c.telefono ?? "",
    pais,
    evento,
    tipoMembresia,
    comprobantes,
    solicitadoPorId: await usuarioSyncId(),
    solicitadoPorNombre: NOMBRE_USUARIO_SYNC,
    leadIdVsl: c.leadId,
  });
  // La nota queda en la solicitud vía un segundo update — crearSolicitud no
  // acepta notaRevision porque normalmente no aplica hasta revisar.
  await supabase
    .from("solicitudes_cliente")
    .update({ nota_revision: notaParaRevisor(c, origen) })
    .eq("id", solicitudId);

  resultado.creadas++;
}

// Mismo flujo que procesarConversionClub, pero hacia Certificaciones —
// VSL también vende "Certificación LEGENDAR·IA", y esas conversiones deben
// caer en las Solicitudes de Certificaciones, no en las del Club (ver
// esVentaDeCertificacion).
async function procesarConversionCertificacion(c: ConvertidoVsl, resultado: ResultadoSincronizarVsl): Promise<void> {
  const clienteExistente = await obtenerClienteCertificacion(c.email.trim().toLowerCase());
  if (clienteExistente) {
    await marcarAccesoDadoVsl(c.leadId);
    resultado.yaEranClientes++;
    return;
  }

  if (await yaExisteSolicitudVsl(c.leadId)) {
    resultado.saltadas++;
    return;
  }

  const solicitudId = randomUUID();

  const regionReportada =
    c.region && (REGIONES_CERTIFICACION as string[]).includes(c.region) ? (c.region as RegionCertificacion) : null;

  let region: RegionCertificacion;
  let origen: OrigenDato;
  if (regionReportada) {
    region = regionReportada;
    origen = "reportado";
  } else {
    const detectada = detectarRegionCertificacionDesdeMontoYMoneda(c.monto, c.moneda);
    if (detectada) {
      region = detectada;
      origen = "detectado";
    } else {
      region = inferirRegionCertificacionDesdeTelefono(c.telefono);
      origen = "adivinado";
    }
  }

  // Todo lo que entra por VSL va a la región VSL de su país (accesos todo VIP).
  const REGION_VSL: Partial<Record<RegionCertificacion, RegionCertificacion>> = {
    MX: "VSL_MX",
    US: "VSL_US",
    LATAM: "VSL_LATAM",
  };
  region = REGION_VSL[region] ?? region;

  const comprobantes = c.comprobanteUrl ? await reubicarComprobante(solicitudId, c.comprobanteUrl) : [];

  await crearSolicitudCertificacion({
    id: solicitudId,
    nombre: c.nombre,
    correo: c.email,
    telefono: c.telefono ?? "",
    region,
    monto: c.monto != null ? `${c.monto}${c.moneda ? ` ${c.moneda}` : ""}` : null,
    notas: c.notas || null,
    comprobantes,
    solicitadoPorId: await usuarioSyncId(),
    solicitadoPorNombre: NOMBRE_USUARIO_SYNC,
    leadIdVsl: c.leadId,
  });
  await supabase
    .from("solicitudes_certificacion")
    .update({ nota_revision: notaParaRevisor(c, origen) })
    .eq("id", solicitudId);

  resultado.creadas++;
}
