// Lo consume el CRM de Renovaciones (sistema aparte): le pasamos la lista de
// clientes inactivos para que arme su propio perfil/seguimiento. "Inactivo"
// usa exactamente la misma definición que el filtro "Inactivos" de
// /clientes (listarClientes({estado:"inactivos"})) — no se reimplementa acá
// para que nunca se desalineen. Revocado es su propio estado, separado de
// inactivos, así que ya queda excluido por listarClientes.
import { NextRequest, NextResponse } from "next/server";
import { requerirTokenExterno } from "@/lib/token-externo";
import { listarClientes, listarEventos } from "@/lib/db";
import { finAccesoCalculado } from "@/lib/fechas";

const LIMITE = 500;

function soloFecha(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

export async function GET(req: NextRequest) {
  const noAutorizado = requerirTokenExterno(req, "RENOVACIONES_API_TOKEN");
  if (noAutorizado) return noAutorizado;

  const pagina = Math.max(1, Number(req.nextUrl.searchParams.get("pagina") ?? "1") || 1);

  const { clientes, total } = await listarClientes({ estado: "inactivos", pagina, limite: LIMITE });

  const data = await Promise.all(
    clientes.map(async (c) => {
      const eventos = await listarEventos(c.id);
      const notas = eventos
        .filter((e) => e.tipo === "NOTA")
        .map((e) => ({ texto: e.detalle, fecha: e.fecha, autor: e.autor }));
      const fin = finAccesoCalculado(c.fechaInscripcion, c.fechaRenovacion);
      return {
        id: c.id,
        nombre: c.nombre,
        correo: c.email,
        telefono: c.telefono,
        pais: c.pais,
        ciudad: c.ciudad,
        evento: c.evento,
        fecha_inscripcion: soloFecha(c.fechaInscripcion),
        fin_acceso: fin ? fin.toISOString().slice(0, 10) : null,
        // Club Sinergético no tiene un campo de responsable/vendedor por cliente.
        asignado: null,
        notas,
      };
    })
  );

  const hayMas = pagina * LIMITE < total;
  const siguiente = hayMas
    ? `${req.nextUrl.origin}${req.nextUrl.pathname}?pagina=${pagina + 1}`
    : undefined;

  return NextResponse.json({ clientes: data, ...(siguiente ? { siguiente } : {}) });
}
