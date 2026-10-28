// Guardia: toda ruta que toca un evento o una hoja concreta debe comprobar la asignación (requerirEvento / requerirHoja),
// para que una ruta nueva no pueda exponer hojas de eventos a los que la persona no está asignada.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(process.cwd(), "src/app/api/captura-datos");
// Rutas que no son de un evento/hoja concreto o cuyo control de acceso es otro (rol admin).
const EXENTAS = new Set(["eventos/route.ts", "axis/route.ts", "drive/carpeta/route.ts"]);

function rutas(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? rutas(p) : n === "route.ts" ? [p] : [];
  });
}

describe("rutas de evento y hoja", () => {
  // replaceAll: en Windows path.join arma las rutas con "\", y EXENTAS está
  // escrito con "/" — sin normalizar, el filtro nunca hacía match ahí y las
  // 3 rutas exentas se evaluaban igual que las demás (fallando, a propósito
  // no tienen requerirEvento/requerirHoja).
  const archivos = rutas(RAIZ)
    .map((p) => p.slice(RAIZ.length + 1).replaceAll("\\", "/"))
    .filter((r) => !EXENTAS.has(r));

  it("encuentra las rutas a revisar", () => expect(archivos.length).toBeGreaterThanOrEqual(10));

  it.each(archivos)("%s comprueba el acceso del usuario", (ruta) => {
    const codigo = readFileSync(join(RAIZ, ruta), "utf8");
    expect(codigo).toMatch(/requerir(Evento|Hoja)\(permiso\.usuario/);
  });

  it("DELETE de evento borra solo vía borrarEventoDirecto (deja historial)", () => {
    const codigo = readFileSync(join(RAIZ, "eventos/[id]/route.ts"), "utf8");
    expect(codigo).not.toMatch(/eliminarEvento/);
    expect(codigo).toMatch(/borrarEventoDirecto/);
  });
});
