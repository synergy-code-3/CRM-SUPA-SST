import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { crearClienteCertificacion } from "@/lib/certificaciones";
import { agregarOpcionCatalogo } from "@/lib/catalogo";
import { REGIONES_CERTIFICACION, type RegionCertificacion } from "@/lib/certificaciones-tipos";

const MAX_FILAS = 2000;

type FilaEntrada = {
  nombre?: string;
  email?: string;
  telefono?: string;
  region?: string;
  notas?: string;
  vendedor?: string;
  fechaInscripcion?: string | null;
};

// Importación masiva de clientes de Certificaciones desde un CSV ya parseado
// en el navegador. Cada fila se crea por separado (un correo repetido solo
// falla esa fila) y se reporta cuántas entraron y cuáles no.
export async function POST(req: NextRequest) {
  const permiso = await requerirPermiso("gestionarCertificaciones");
  if (!permiso.ok) return permiso.respuesta;

  const body = await req.json().catch(() => null);
  const filas: FilaEntrada[] = Array.isArray(body?.filas) ? body.filas : [];
  if (filas.length === 0) return NextResponse.json({ error: "No hay filas para importar" }, { status: 400 });
  if (filas.length > MAX_FILAS) {
    return NextResponse.json({ error: `Máximo ${MAX_FILAS} filas por importación` }, { status: 400 });
  }

  const regionLote: string = typeof body?.region === "string" ? body.region : "";
  const etiqueta: string = typeof body?.etiqueta === "string" ? body.etiqueta.trim() : "";
  const tag: string = typeof body?.tag === "string" ? body.tag.trim() : "";

  if (tag) await agregarOpcionCatalogo("tag_certificaciones", tag).catch(() => {});

  let ok = 0;
  const errores: { email: string; error: string }[] = [];
  for (const fila of filas) {
    const email = (fila.email ?? "").trim();
    try {
      const regionFinal = regionLote || fila.region || "";
      await crearClienteCertificacion(
        {
          nombre: (fila.nombre ?? "").trim() || email,
          email,
          telefono: fila.telefono || null,
          region: (REGIONES_CERTIFICACION as string[]).includes(regionFinal) ? (regionFinal as RegionCertificacion) : null,
          notas: fila.notas || null,
          vendedor: fila.vendedor || null,
          fechaLlegada: fila.fechaInscripcion || null,
          etiquetas: etiqueta ? [etiqueta] : [],
          tags: tag ? [tag] : [],
          origen: "csv",
        },
        permiso.usuario.nombre,
        permiso.usuario.rol
      );
      ok++;
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      errores.push({
        email,
        error: /duplicate|already exists|unique/i.test(mensaje) ? "Ya existe un cliente con ese correo" : mensaje,
      });
    }
  }

  return NextResponse.json({ ok, errores });
}
