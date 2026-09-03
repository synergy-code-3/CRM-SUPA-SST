import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { listarTodosClientes } from "@/lib/db";
import { parsearFechaSkool } from "@/lib/fechas";

// Este endpoint pagina la tabla completa de clientes para las agregaciones
// del dashboard; con 23k+ filas puede pasar el límite por defecto.
export const maxDuration = 30;

function agruparTopMasOtros(
  distribucion: Record<string, number>,
  top: number
): { nombre: string; cantidad: number }[] {
  const ordenado = Object.entries(distribucion).sort((a, b) => b[1] - a[1]);
  const principales = ordenado.slice(0, top).map(([nombre, cantidad]) => ({ nombre, cantidad }));
  const resto = ordenado.slice(top).reduce((acc, [, cantidad]) => acc + cantidad, 0);
  if (resto > 0) principales.push({ nombre: "Otros", cantidad: resto });
  return principales;
}

// Solo hay 3 membresías reales (3/6/12 Meses) — el CSV de origen trae el
// mismo valor con distinta mayúscula/minúscula en algunas filas ("3 MESES"
// vs "3 Meses"), y sin normalizar antes de agrupar el dashboard las cuenta
// como si fueran categorías separadas. Cualquier otro texto libre se deja
// tal cual (cae en "Otros" al agrupar).
const MEMBRESIA_CANONICA: Record<string, string> = {
  "3 meses": "3 Meses",
  "6 meses": "6 Meses",
  "12 meses": "12 Meses",
};

function normalizarMembresiaParaDashboard(v: string): string {
  return MEMBRESIA_CANONICA[v.trim().toLowerCase()] ?? v.trim();
}

function claveMes(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

const MES_LABEL = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

export async function GET() {
  const permiso = await requerirPermiso("verDashboard");
  if (!permiso.ok) return permiso.respuesta;

  const clientes = await listarTodosClientes();

  const ahora = new Date();
  const hace30Dias = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const en15Dias = new Date(ahora.getTime() + 15 * 24 * 60 * 60 * 1000);

  const altasRecientes = clientes.filter(
    (c) => new Date(c.fechaInscripcion ?? c.creadoEn).getTime() >= hace30Dias
  ).length;

  let conAcceso = 0;
  let conSkool = 0;
  let vencenPronto = 0;
  let vencidas = 0;
  const distribucionAcceso: Record<string, number> = {};
  const membresias: Record<string, number> = {};

  for (const c of clientes) {
    const acceso = (c.accesoPlataforma ?? "Sin dato").trim() || "Sin dato";
    distribucionAcceso[acceso] = (distribucionAcceso[acceso] ?? 0) + 1;
    if (acceso.toLowerCase() === "si") conAcceso++;

    if (c.tipoMembresia) {
      const clave = normalizarMembresiaParaDashboard(c.tipoMembresia);
      membresias[clave] = (membresias[clave] ?? 0) + 1;
    }

    const venceSkool = parsearFechaSkool(c.vencimientoSkool);
    if (venceSkool) {
      conSkool++;
      if (venceSkool < ahora) vencidas++;
      else if (venceSkool <= en15Dias) vencenPronto++;
    }
  }

  // Inscripciones por mes (últimos 12 meses) + crecimiento acumulado.
  const meses: { clave: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const f = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    meses.push({ clave: claveMes(f), label: `${MES_LABEL[f.getMonth()]} '${String(f.getFullYear()).slice(2)}` });
  }
  const porMes: Record<string, number> = {};
  for (const c of clientes) {
    const f = c.fechaInscripcion ? new Date(c.fechaInscripcion) : null;
    if (!f || Number.isNaN(f.getTime())) continue;
    const k = claveMes(f);
    porMes[k] = (porMes[k] ?? 0) + 1;
  }
  const totalAntesDeVentana = clientes.filter((c) => {
    const f = c.fechaInscripcion ? new Date(c.fechaInscripcion) : null;
    return f && !Number.isNaN(f.getTime()) && claveMes(f) < meses[0].clave;
  }).length;

  let acumulado = totalAntesDeVentana;
  const inscripcionesPorMes = meses.map(({ clave, label }) => {
    const cantidad = porMes[clave] ?? 0;
    acumulado += cantidad;
    return { mes: label, cantidad, acumulado };
  });

  // Sin tope, esto puede traer decenas de valores distintos (años de CSV
  // importado con texto libre) — la tarjeta del dashboard solo tiene lugar
  // para unas pocas barras legibles.
  const topMembresias = agruparTopMasOtros(membresias, 5);

  const resumen = {
    totalClientes: clientes.length,
    conAcceso,
    sinAcceso: clientes.length - conAcceso,
    conSkool,
    vencenPronto,
    vencidas,
    accesos: {
      general: clientes.filter((c) => c.accesos.general.length > 0).length,
      vip: clientes.filter((c) => c.accesos.vip.length > 0).length,
      black: clientes.filter((c) => c.accesos.black.length > 0).length,
    },
    altasRecientes,
    distribucionAcceso: agruparTopMasOtros(distribucionAcceso, 5),
    inscripcionesPorMes,
    topMembresias,
  };

  return NextResponse.json(resumen);
}
