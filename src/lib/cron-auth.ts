import { NextRequest } from "next/server";

// Autoriza tanto la invocación de Vercel Cron (header "Authorization: Bearer
// <CRON_SECRET>", que Vercel agrega solo cuando el proyecto tiene esa
// variable de entorno — ver vercel.json) como la del cron viejo de GitHub
// Actions (?token=, que se deja como respaldo/para pruebas manuales).
export function autorizadoParaCron(req: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secreto}`) return true;
  const token = req.nextUrl.searchParams.get("token");
  return token === secreto;
}
