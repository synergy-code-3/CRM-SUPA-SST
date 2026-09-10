import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { tienePermiso } from "@/lib/permisos";
import { crearSolicitudCertificacion, listarSolicitudesCertificacion } from "@/lib/solicitudes-certificacion";
import { subirComprobante, urlFirmadaComprobante } from "@/lib/storage";
import type { EstadoSolicitudCertificacion } from "@/lib/certificaciones-tipos";

const ESTADOS_VALIDOS: EstadoSolicitudCertificacion[] = ["pendiente", "aprobada", "rechazada"];

export async function GET(req: NextRequest) {
  const permiso = await requerirPermiso("solicitarCertificacion");
  if (!permiso.ok) return permiso.respuesta;

  const { searchParams } = new URL(req.url);
  const estadoParam = searchParams.get("estado");
  const estado = ESTADOS_VALIDOS.includes(estadoParam as EstadoSolicitudCertificacion)
    ? (estadoParam as EstadoSolicitudCertificacion)
    : undefined;

  const puedeRevisar = tienePermiso(permiso.usuario.rol, "revisarSolicitudesCertificacion");
  const solicitudes = await listarSolicitudesCertificacion({
    soloDeUsuario: puedeRevisar ? undefined : permiso.usuario.id,
    estado,
  });

  const conUrls = await Promise.all(
    solicitudes.map(async (s) => ({
      ...s,
      comprobantesUrl: await Promise.all(s.comprobantes.map((ruta) => urlFirmadaComprobante(ruta))),
    }))
  );

  return NextResponse.json({ solicitudes: conUrls });
}

export async function POST(req: NextRequest) {
  const permiso = await requerirPermiso("solicitarCertificacion");
  if (!permiso.ok) return permiso.respuesta;

  const form = await req.formData();
  const nombre = String(form.get("nombre") ?? "").trim();
  const correo = String(form.get("correo") ?? "").trim();
  const telefono = String(form.get("telefono") ?? "").trim();
  const region = String(form.get("region") ?? "").trim();
  const monto = String(form.get("monto") ?? "").trim();
  const etiqueta = String(form.get("etiqueta") ?? "").trim();
  const notas = String(form.get("notas") ?? "").trim();
  const archivos = form.getAll("comprobantes").filter((v): v is File => v instanceof File && v.size > 0);

  if (!nombre || !correo || !telefono) {
    return NextResponse.json({ error: "Todos los campos son obligatorios" }, { status: 400 });
  }
  // Mismo respaldo que el formulario del Club (ver /api/solicitudes): si el
  // teléfono se precarga solo con la lada del país y nunca se corrige,
  // GHL/Skool lo rechazan más adelante — mejor cortarlo aquí.
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

    const solicitud = await crearSolicitudCertificacion({
      id,
      nombre,
      correo,
      telefono,
      region: region || null,
      monto: monto || null,
      etiqueta: etiqueta || null,
      notas: notas || null,
      comprobantes: rutas,
      solicitadoPorId: permiso.usuario.id,
      solicitadoPorNombre: permiso.usuario.nombre,
    });

    return NextResponse.json({ solicitud });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
