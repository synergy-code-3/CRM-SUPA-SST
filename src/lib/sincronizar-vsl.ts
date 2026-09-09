import { randomUUID } from "crypto";
import { supabase } from "./supabase";
import { hashPassword } from "./auth";
import { obtenerCliente } from "./db";
import { crearSolicitud, obtenerSolicitudPorLeadVsl } from "./solicitudes";
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

// Adivina el evento/país a partir del código de país del teléfono — se usa
// solo como respaldo cuando VSL no reporta monto/moneda (ventas manuales,
// "sin registrar"). El admin puede corregirlo antes de aprobar si adivinó
// mal (ver editarSolicitud). Los 3 eventos ("VSL MX/USA/LATAM") ya están en
// el catálogo de Biblioteca y en Asignacion de boletos.csv (1/2/3 VIP MX +
// 1/2/3 VIP US para 3/6/12 meses, igual sin importar la región).
function inferirEventoYPaisDesdeTelefono(telefono: string | null): { evento: string; pais: string | null } {
  const limpio = (telefono ?? "").replace(/[^\d+]/g, "");
  if (limpio.startsWith("+52")) return { evento: "VSL MX", pais: "México" };
  if (limpio.startsWith("+1")) return { evento: "VSL USA", pais: "Estados Unidos" };
  return { evento: "VSL LATAM", pais: null };
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

function notaParaRevisor(c: ConvertidoVsl, tipoMembresiaDetectada: boolean): string {
  const partes = [
    `Detectado automático desde VSL — producto: "${c.producto}"`,
    c.vendedor ? `vendedor: ${c.vendedor}` : null,
    c.monto != null ? `monto: ${c.monto}${c.moneda ? ` ${c.moneda}` : ""}` : null,
    `fuente: ${c.fuenteVenta}`,
    c.fechaVenta ? `vendido el ${new Date(c.fechaVenta).toLocaleDateString("es-MX")}` : null,
    !tipoMembresiaDetectada
      ? "⚠ No se pudo detectar la región/duración por monto — verificar evento y tipo de membresía antes de aprobar"
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

export async function sincronizarSolicitudesVsl(): Promise<ResultadoSincronizarVsl> {
  const convertidos = await listarTodosConvertidosVsl();
  const resultado: ResultadoSincronizarVsl = { creadas: 0, yaEranClientes: 0, saltadas: 0, errores: 0 };

  for (const c of convertidos) {
    if (c.accesoDado) {
      resultado.saltadas++;
      continue;
    }

    try {
      // Si el correo ya es cliente aquí (alta manual, u otra vía), no hace
      // falta pasar por Solicitudes — solo se le avisa a VSL que ya tiene
      // acceso, para que deje de aparecer como pendiente de su lado.
      const clienteExistente = await obtenerCliente(c.email.trim().toLowerCase());
      if (clienteExistente) {
        await marcarAccesoDadoVsl(c.leadId);
        resultado.yaEranClientes++;
        continue;
      }

      const yaExiste = await obtenerSolicitudPorLeadVsl(c.leadId);
      if (yaExiste) {
        resultado.saltadas++;
        continue;
      }

      const solicitudId = randomUUID();
      const detectado = detectarDesdeMontoYMoneda(c.monto, c.moneda);
      const { evento, pais } = detectado ?? inferirEventoYPaisDesdeTelefono(c.telefono);
      const tipoMembresia = detectado?.tipoMembresia ?? TIPO_MEMBRESIA_DEFAULT;
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
      // La nota queda en la solicitud vía un segundo update — crearSolicitud
      // no acepta notaRevision porque normalmente no aplica hasta revisar.
      await supabase
        .from("solicitudes_cliente")
        .update({ nota_revision: notaParaRevisor(c, detectado != null) })
        .eq("id", solicitudId);

      resultado.creadas++;
    } catch {
      resultado.errores++;
    }
  }

  return resultado;
}
