import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import {
  buscarIdsCertificaciones,
  CRITERIOS_BUSQUEDA_CERTIFICACION,
  type CriterioBusquedaCertificacion,
} from "@/lib/certificaciones";

// Búsqueda de texto libre de la lista de Certificaciones — devuelve solo los
// ids que coinciden (la página ya tiene los clientes cargados). ?q=texto y
// ?en=nombre,correo,telefono,notas,historial (por defecto todos).
export async function GET(req: NextRequest) {
  const permiso = await requerirPermiso("verCertificaciones");
  if (!permiso.ok) return permiso.respuesta;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const en = (searchParams.get("en") ?? "")
    .split(",")
    .filter((c): c is CriterioBusquedaCertificacion =>
      (CRITERIOS_BUSQUEDA_CERTIFICACION as string[]).includes(c)
    );
  const criterios = en.length ? en : CRITERIOS_BUSQUEDA_CERTIFICACION;

  try {
    const ids = await buscarIdsCertificaciones(q, criterios);
    return NextResponse.json({ ids });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
