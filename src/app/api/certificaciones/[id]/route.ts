import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import {
  abonosCertificacion,
  actualizarDatosCertificacion,
  eventosCertificacion,
  obtenerClienteCertificacion,
} from "@/lib/certificaciones";
import { clienteClubActivo, obtenerCliente } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCertificaciones");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const clienteId = decodeURIComponent(id);
  const cliente = await obtenerClienteCertificacion(clienteId);
  if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const [eventos, abonos] = await Promise.all([
    eventosCertificacion(clienteId),
    abonosCertificacion(clienteId),
  ]);

  // Cruce informativo con Club Sinergético (roster aparte) — si el correo
  // también es cliente del Club, se le muestra si está activo o inactivo.
  // null = no es cliente del Club en absoluto (no se muestra nada en ese
  // caso). Best-effort: si falla, el perfil sigue abriendo sin este dato.
  const clienteClub = await obtenerCliente(cliente.email || cliente.id).catch(() => null);
  const estadoClub: "activo" | "inactivo" | null = clienteClub ? (clienteClubActivo(clienteClub) ? "activo" : "inactivo") : null;

  return NextResponse.json({ cliente, eventos, abonos, estadoClub });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("gestionarCertificaciones");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const clienteId = decodeURIComponent(id);
  const body = await req.json();
  if (!body?.nombre?.trim()) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }

  try {
    const cliente = await actualizarDatosCertificacion(
      clienteId,
      {
        nombre: body.nombre,
        email: body.email,
        telefono: body.telefono,
        region: body.region,
        notas: body.notas,
        monto: body.monto,
      },
      permiso.usuario.nombre
    );
    return NextResponse.json({ cliente });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
