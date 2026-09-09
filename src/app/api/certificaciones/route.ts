import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { crearClienteCertificacion, listarClientesCertificacion } from "@/lib/certificaciones";

export async function GET() {
  const permiso = await requerirPermiso("verCertificaciones");
  if (!permiso.ok) return permiso.respuesta;

  const clientes = await listarClientesCertificacion();
  return NextResponse.json({ clientes });
}

export async function POST(req: NextRequest) {
  const permiso = await requerirPermiso("gestionarCertificaciones");
  if (!permiso.ok) return permiso.respuesta;

  const body = await req.json();
  if (!body?.email?.trim() || !body?.nombre?.trim()) {
    return NextResponse.json({ error: "Nombre y correo son obligatorios" }, { status: 400 });
  }

  try {
    const cliente = await crearClienteCertificacion(
      {
        nombre: body.nombre,
        email: body.email,
        telefono: body.telefono,
        region: body.region,
        notas: body.notas,
        monto: body.monto,
        etiquetas: body.etiquetas,
      },
      permiso.usuario.nombre,
      permiso.usuario.rol
    );
    return NextResponse.json({ cliente });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
