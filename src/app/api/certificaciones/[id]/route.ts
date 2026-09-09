import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import {
  abonosCertificacion,
  actualizarDatosCertificacion,
  eventosCertificacion,
  obtenerClienteCertificacion,
} from "@/lib/certificaciones";

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
  return NextResponse.json({ cliente, eventos, abonos });
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
