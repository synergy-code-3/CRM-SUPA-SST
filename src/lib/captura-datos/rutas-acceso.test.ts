// Guardia: toda ruta que toca un evento o una hoja concreta debe comprobar la asignación (requerirEvento / requerirHoja),
// para que una ruta nueva no pueda exponer hojas de eventos a los que la persona no está asignada.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(process.cwd(), "src/app/api/captura-datos");
// Rutas que no son de un evento/hoja concreto o cuyo control de acceso es otro (rol admin).
const EXENTAS = new Set(["eventos/route.ts", "axis/route.ts", "drive/carpeta/route.ts", "historial/route.ts"]);

function rutas(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? rutas(p) : n === "route.ts" ? [p] : [];
  });
}

describe("rutas de evento y hoja", () => {
  const archivos = rutas(RAIZ).map((p) => p.slice(RAIZ.length + 1)).filter((r) => !EXENTAS.has(r));

  it("encuentra las rutas a revisar", () => expect(archivos.length).toBeGreaterThanOrEqual(10));

  it.each(archivos)("%s comprueba el acceso del usuario", (ruta) => {
    const codigo = readFileSync(join(RAIZ, ruta), "utf8");
    expect(codigo).toMatch(/requerir(Evento|Hoja)\(permiso\.usuario/);
  });

  it("el historial solo lo puede leer un admin", () => {
    const codigo = readFileSync(join(RAIZ, "historial/route.ts"), "utf8");
    expect(codigo).toMatch(/requerirPermiso\("verCapturaDatos"\)/);
    expect(codigo).toMatch(/rol !== "admin"/);
  });

  it("el cron de purga exige el secreto del cron", () => {
    const codigo = readFileSync(join(process.cwd(), "src/app/api/cron/purgar-auditoria/route.ts"), "utf8");
    expect(codigo).toMatch(/autorizadoParaCron\(req\)/);
  });

  it("el cron de purga es público en el middleware (Vercel Cron no manda cookie) y está programado", () => {
    expect(readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8")).toContain("/api/cron/purgar-auditoria");
    expect(readFileSync(join(process.cwd(), "vercel.json"), "utf8")).toContain("/api/cron/purgar-auditoria");
  });

  it("DELETE de evento borra solo vía borrarEventoDirecto (deja historial)", () => {
    const codigo = readFileSync(join(RAIZ, "eventos/[id]/route.ts"), "utf8");
    expect(codigo).not.toMatch(/eliminarEvento/);
    expect(codigo).toMatch(/borrarEventoDirecto/);
  });
});
