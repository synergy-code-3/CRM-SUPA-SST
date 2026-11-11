import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { respuestaError, ErrorPeticion } from "@/lib/captura-datos/api";
import { leerTanda, subirTanda } from "@/lib/captura-datos/subida-drive";
import { idDrive } from "@/lib/captura-datos/validacion";

export const maxDuration = 300;

// Sube fotos a la carpeta de Drive de un evento que todavía no existe: el evento se crea después, con las hojas ya subidas.
export async function POST(req: NextRequest) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;
  if (permiso.usuario.rol !== "admin") return NextResponse.json({ error: "No tienes permiso para esto" }, { status: 403 });

  try {
    const tanda = await leerTanda(req);
    const destinoId = idDrive.safeParse(tanda.form.get("destinoId"));
    if (!destinoId.success) throw new ErrorPeticion(400, "Carpeta de Drive inválida");
    return NextResponse.json({ fotos: await subirTanda(destinoId.data, tanda) });
  } catch (err) {
    return respuestaError(err, "captura-datos/drive/subir POST");
  }
}
