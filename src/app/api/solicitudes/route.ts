import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { tienePermiso } from "@/lib/permisos";
import { crearSolicitud, listarSolicitudes } from "@/lib/solicitudes";
import { subirComprobante, urlFirmadaComprobante } from "@/lib/storage";
import type { EstadoSolicitud } from "@/lib/types";

const ESTADOS_VALIDOS: EstadoSolicitud[] = ["pendiente", "aprobada", "rechazada", "correo_invalido"];

export async function GET(req: NextRequest) {
  const permiso = await requerirPermiso("solicitarCliente");
  if (!permiso.ok) return permiso.respuesta;

  const { searchParams } = new URL(req.url);
  const estadoParam = searchParams.get("estado");
  const estado = ESTADOS_VALIDOS.includes(estadoParam as EstadoSolicitud) ? (estadoParam as EstadoSolicitud) : undefined;

  // Un admin (revisarSolicitudes) ve las solicitudes de todos; el resto solo
  // ve las suyas propias, para poder seguir su estado sin exponer las de
  // otros vendedores.
  const puedeRevisar = tienePermiso(permiso.usuario.rol, "revisarSolicitudes");
  const solicitudes = await listarSolicitudes({
    soloDeUsuario: puedeRevisar ? undefined : permiso.usuario.id,
    estado,
  });

  // Firmar comprobantes es una llamada a Supabase Storage por archivo — con
  // cientos de solicitudes ya resueltas (aprobada/rechazada) acumuladas,
  // firmarlas TODAS en cada carga de la página se volvía cientos de
  // llamadas concurrentes, tardaba muchísimo y a veces ni cargaba (si UNA
  // fallaba, Promise.all tronaba la respuesta completa). Solo pendiente y
  // correo_invalido muestran el link de comprobante inline en la tarjeta de
  // "Pendientes de revisión" — para el resto se firma bajo demanda al abrir
  // el detalle, ver GET /api/solicitudes/[id]/comprobantes.
  const conUrls = await Promise.all(
    solicitudes.map(async (s) => {
      if (s.estado !== "pendiente" && s.estado !== "correo_invalido") {
        return { ...s, comprobantesUrl: [] as string[] };
      }
      const resultados = await Promise.allSettled(s.comprobantes.map((ruta) => urlFirmadaComprobante(ruta)));
      const comprobantesUrl = resultados
        .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
        .map((r) => r.value);
      return { ...s, comprobantesUrl };
    })
  );

  return NextResponse.json({ solicitudes: conUrls });
}

export async function POST(req: NextRequest) {
  const permiso = await requerirPermiso("solicitarCliente");
  if (!permiso.ok) return permiso.respuesta;

  const form = await req.formData();
  const nombre = String(form.get("nombre") ?? "").trim();
  const correoPago = String(form.get("correoPago") ?? "").trim();
  const correoAcceso = String(form.get("correoAcceso") ?? "").trim();
  const telefono = String(form.get("telefono") ?? "").trim();
  const pais = String(form.get("pais") ?? "").trim();
  const evento = String(form.get("evento") ?? "").trim();
  const tipoMembresia = String(form.get("tipoMembresia") ?? "").trim();
  const etiqueta = String(form.get("etiqueta") ?? "").trim();
  const notas = String(form.get("notas") ?? "").trim();
  const archivos = form.getAll("comprobantes").filter((v): v is File => v instanceof File && v.size > 0);

  if (!nombre || !correoPago || !correoAcceso || !telefono || !evento || !tipoMembresia) {
    return NextResponse.json({ error: "Todos los campos son obligatorios" }, { status: 400 });
  }
  // El formulario precarga la lada del país en Teléfono — si nunca se
  // escribió el número real, queda solo la lada (ej. "+52") y GHL lo
  // rechaza al aprobar la solicitud. Se corta aquí, no solo en el front.
  if (telefono.replace(/\D/g, "").length < 8) {
    return NextResponse.json({ error: "El teléfono está incompleto (falta el número, no solo la lada)" }, { status: 400 });
  }
  if (archivos.length === 0) {
    return NextResponse.json({ error: "Adjunta al menos un comprobante de pago" }, { status: 400 });
  }

  try {
    const id = randomUUID();
    const rutas: string[] = [];
    for (const archivo of archivos) {
      rutas.push(await subirComprobante(id, archivo));
    }

    const solicitud = await crearSolicitud({
      id,
      nombre,
      correoPago,
      correoAcceso,
      telefono,
      pais: pais || null,
      evento,
      tipoMembresia,
      etiqueta: etiqueta || null,
      notas: notas || null,
      comprobantes: rutas,
      solicitadoPorId: permiso.usuario.id,
      solicitadoPorNombre: permiso.usuario.nombre,
    });

    return NextResponse.json({ solicitud });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo enviar la solicitud";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
