import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { tienePermiso } from "@/lib/permisos";
import { crearSolicitud, listarSolicitudes } from "@/lib/solicitudes";
import { subirComprobante, urlFirmadaComprobante } from "@/lib/storage";
import type { EstadoSolicitud } from "@/lib/types";

const ESTADOS_VALIDOS: EstadoSolicitud[] = ["pendiente", "aprobada", "rechazada"];

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

  const conUrls = await Promise.all(
    solicitudes.map(async (s) => ({
      ...s,
      comprobantesUrl: await Promise.all(s.comprobantes.map((ruta) => urlFirmadaComprobante(ruta))),
    }))
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
  const archivos = form.getAll("comprobantes").filter((v): v is File => v instanceof File && v.size > 0);

  if (!nombre || !correoPago || !correoAcceso || !telefono || !evento || !tipoMembresia) {
    return NextResponse.json({ error: "Todos los campos son obligatorios" }, { status: 400 });
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
