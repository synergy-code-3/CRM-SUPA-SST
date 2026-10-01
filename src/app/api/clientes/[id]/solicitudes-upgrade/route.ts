import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { obtenerCliente } from "@/lib/db";
import { crearSolicitudUpgrade, obtenerSolicitudUpgradePendiente } from "@/lib/solicitudes-upgrade";
import { subirComprobante, urlFirmadaComprobante } from "@/lib/storage";

// Para pintar en el perfil: si hay una solicitud de upgrade pendiente para
// este cliente, con el/los comprobante(s) ya firmados para poder verlos. Lo
// puede ver cualquiera que vea el perfil (verClientes) — tanto quien la
// mandó (para ver "pendiente de revisión") como el admin que la va a
// resolver.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verClientes");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const clienteId = decodeURIComponent(id);

  try {
    const solicitud = await obtenerSolicitudUpgradePendiente(clienteId);
    if (!solicitud) return NextResponse.json({ solicitud: null });
    const comprobantesUrl = await Promise.all(solicitud.comprobantes.map((ruta) => urlFirmadaComprobante(ruta)));
    return NextResponse.json({ solicitud: { ...solicitud, comprobantesUrl } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// "Solicitar upgrade a 12 meses" — pensado para quien no puede editar el
// cliente directo (abeja, y coordinador en el Club). Requiere comprobante de
// pago, igual que la solicitud de alta.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("solicitarUpgradeMembresia");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const clienteId = decodeURIComponent(id);

  try {
    const cliente = await obtenerCliente(clienteId);
    if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    if (cliente.tipoMembresia?.trim().toLowerCase() === "12 meses") {
      return NextResponse.json({ error: "Este cliente ya tiene 12 Meses" }, { status: 400 });
    }

    const yaPendiente = await obtenerSolicitudUpgradePendiente(clienteId);
    if (yaPendiente) {
      return NextResponse.json({ error: "Ya hay una solicitud de upgrade pendiente para este cliente" }, { status: 409 });
    }

    const form = await req.formData();
    const notas = String(form.get("notas") ?? "").trim();
    const archivos = form.getAll("comprobantes").filter((v): v is File => v instanceof File && v.size > 0);
    if (archivos.length === 0) {
      return NextResponse.json({ error: "Adjunta al menos un comprobante de pago" }, { status: 400 });
    }

    const solicitudId = randomUUID();
    const rutas: string[] = [];
    for (const archivo of archivos) {
      rutas.push(await subirComprobante(solicitudId, archivo));
    }

    const solicitud = await crearSolicitudUpgrade({
      id: solicitudId,
      clienteId,
      membresiaActual: cliente.tipoMembresia ?? "—",
      comprobantes: rutas,
      notas: notas || null,
      solicitadoPorId: permiso.usuario.id,
      solicitadoPorNombre: permiso.usuario.nombre,
    });

    return NextResponse.json({ solicitud });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo enviar la solicitud";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
