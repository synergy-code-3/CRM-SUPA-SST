import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { obtenerCliente } from "@/lib/db";
import { obtenerHoja } from "@/lib/captura-datos/db";
import { decodificar, hojaPerteneceACliente } from "@/lib/captura-datos/cliente-hojas";
import { respuestaArchivoHoja } from "@/lib/captura-datos/archivo-hoja";
import { respuestaError } from "@/lib/captura-datos/api";
import { ErrorPeticion } from "@/lib/captura-datos/errores";
import { idValido } from "@/lib/captura-datos/modelo";

export const maxDuration = 60;

// La vista (no la descarga) se guarda 5 min en el navegador de quien la pidió: menos que los 10 min de la URL firmada.
const CACHE_VISTA = "private, max-age=300";

// Se responde 404 (no 403) tanto si la hoja no existe como si es de otra persona, para no revelar que existe.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; hojaId: string }> }) {
  const permiso = await requerirPermiso("verClientes");
  if (!permiso.ok) return permiso.respuesta;

  const { id, hojaId } = await params;
  try {
    try {
      idValido(hojaId);
    } catch {
      throw new ErrorPeticion(404, "No encontrado");
    }
    const [cliente, hoja] = await Promise.all([obtenerCliente(decodificar(id)), obtenerHoja(hojaId)]);
    if (!cliente || !hoja || !hojaPerteneceACliente(hoja, cliente)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    const descargar = req.nextUrl.searchParams.get("descargar") === "1";
    const respuesta = await respuestaArchivoHoja(hoja, descargar);
    if (!descargar && (respuesta.ok || respuesta.status === 307)) respuesta.headers.set("Cache-Control", CACHE_VISTA);
    return respuesta;
  } catch (err) {
    return respuestaError(err, "clientes/[id]/hojas/[hojaId]/archivo GET");
  }
}
