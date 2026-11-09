import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // lib/boletos.ts lee "Asignacion de boletos.csv" del disco en tiempo de
  // ejecución (no es un import estático), así que Next no lo detecta solo
  // al empaquetar las funciones serverless — hay que declararlo a mano o
  // en Vercel se rompe con ENOENT.
  outputFileTracingIncludes: {
    "/api/**/*": ["./Asignacion de boletos.csv", "./plantilla-captura-datos/plantilla.xlsx"],
  },
  // Solo en `next dev`: el MCP de Playwright escribe sus logs de consola en
  // .playwright-mcp/ dentro del proyecto, y el aviso de recarga que imprime
  // el navegador tras cada compilación vuelve a escribir ahí — eso dejaba
  // el servidor recompilando en bucle y la app atorada en "cargando".
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/node_modules/**", "**/.git/**", "**/.next/**", "**/.playwright-mcp/**"],
      };
    }
    return config;
  },
};

export default nextConfig;
