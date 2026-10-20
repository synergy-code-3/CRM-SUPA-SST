import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // lib/boletos.ts lee "Asignacion de boletos.csv" del disco en tiempo de
  // ejecución (no es un import estático), así que Next no lo detecta solo
  // al empaquetar las funciones serverless — hay que declararlo a mano o
  // en Vercel se rompe con ENOENT.
  outputFileTracingIncludes: {
    "/api/**/*": ["./Asignacion de boletos.csv", "./plantilla-captura-datos/plantilla.xlsx"],
  },
};

export default nextConfig;
