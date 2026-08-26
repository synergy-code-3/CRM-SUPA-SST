import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SESION, verificarTokenSesion } from "@/lib/jwt-edge";

// Gate barato: ¿hay una cookie de sesión con JWT válido? No toca la base de
// datos (correría en cada request, incluidas cargas de assets) — la
// verificación fuerte (usuario activo, rol vigente) vive en
// obtenerUsuarioActual() (src/lib/auth.ts), llamada por cada route handler.
const RUTAS_PUBLICAS_EXACTAS = ["/login"];
const PREFIJOS_PUBLICOS_API = [
  "/api/auth/login",
  "/api/auth/registro",
  // Kajabi, Hotmart y GHL no firman sus webhooks con cookie de sesión; se
  // autentican con su propio ?token=, igual que el cron.
  "/api/webhooks/kajabi",
  "/api/webhooks/hotmart",
  "/api/webhooks/ghl-bienvenida-wa",
  "/api/cron/sincronizar-kajabi",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const esApi = pathname.startsWith("/api/");

  if (PREFIJOS_PUBLICOS_API.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (RUTAS_PUBLICAS_EXACTAS.includes(pathname)) return NextResponse.next();

  const token = req.cookies.get(COOKIE_SESION)?.value;
  const sesion = token ? await verificarTokenSesion(token) : null;

  if (!sesion) {
    if (esApi) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // manifest.webmanifest/sw.js/icons/*/icon.png/apple-icon.png tienen que
  // quedar fuera del middleware igual que favicon.ico: el sistema operativo
  // los pide para decidir si la app es instalable (Agregar a pantalla de
  // inicio) sin que haya una sesión iniciada todavía — si el middleware los
  // redirige a /login, iOS/Android nunca ven el manifest ni los íconos.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|icon.png|apple-icon.png).*)"],
};
