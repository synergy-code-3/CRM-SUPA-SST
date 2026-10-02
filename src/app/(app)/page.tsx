"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  ShieldCheck,
  ShieldOff,
  GraduationCap,
  Clock,
  AlertTriangle,
  TrendingUp,
  Search,
} from "lucide-react";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";
import type { Cliente } from "@/lib/types";
import { ChartCard } from "@/components/charts/ChartCard";
import { Kpi } from "@/components/charts/Kpi";
import { DonutChart } from "@/components/charts/DonutChart";
import { BarChart } from "@/components/charts/BarChart";
type Resumen = {
  totalClientes: number;
  conAcceso: number;
  sinAcceso: number;
  conSkool: number;
  vencenPronto: number;
  vencidas: number;
  altasRecientes: number;
  distribucionAcceso: { nombre: string; cantidad: number }[];
  inscripcionesPorMes: { mes: string; cantidad: number; acumulado: number }[];
  topMembresias: { nombre: string; cantidad: number }[];
};

const COLORES_DONA = ["#ef4444", "#10b981", "#0a5cff", "#f59e0b", "#8b5cf6", "#5b6472"];

// Mide el tamaño real (en px) del contenedor para dibujar el SVG exactamente
// a esa medida — así el viewBox nunca tiene que estirarse/aplastarse para
// llenar la tarjeta (que es lo que deformaba texto y puntos antes).
function useTamanoContenedor<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [tam, setTam] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setTam({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, tam] as const;
}

export default function DashboardPage() {
  const router = useRouter();
  const { usuario } = useSesion();
  const [resumen, setResumen] = useState<Resumen | null>(null);
  // "Dashboard" es solo para admin (verDashboard) — coordinador/abeja nunca
  // ven el link en el menú, pero sí podían llegar aquí escribiendo "/" a
  // mano y se quedaban con una página rota (fetch de /api/resumen 403,
  // resumen.inscripcionesPorMes.map sobre eso reventaba). Ahora se manda a
  // Clientes, que los tres roles sí pueden ver.
  const puedeVer = !!usuario && tienePermiso(usuario.rol, "verDashboard");

  useEffect(() => {
    if (usuario && !puedeVer) router.replace("/clientes");
  }, [usuario, puedeVer, router]);

  useEffect(() => {
    if (!puedeVer) return;
    fetch("/api/resumen")
      .then((r) => (r.ok ? r.json() : null))
      .then(setResumen);
  }, [puedeVer]);

  if (!puedeVer) return null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted">Resumen general del Club Sinergético.</p>
      </div>

      <BuscadorClientesDashboard />

      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted">Resumen general</p>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={Users} label="Total Contactos" sub="registros" value={resumen?.totalClientes} tone="primary" />
        <Kpi icon={ShieldCheck} label="Con Acceso" sub="plataforma activa" value={resumen?.conAcceso} tone="success" />
        <Kpi icon={ShieldOff} label="Sin Acceso" sub="sin activar" value={resumen?.sinAcceso} tone="danger" />
        <Kpi icon={GraduationCap} label="Con Skool" sub="membresía reg." value={resumen?.conSkool} tone="teal" />
        <Kpi icon={Clock} label="Vencen pronto" sub="≤ 15 días" value={resumen?.vencenPronto} tone="warning" />
        <Kpi icon={AlertTriangle} label="Vencidas" sub="expiradas" value={resumen?.vencidas} tone="purple" />
      </div>

      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted">
        Análisis visual <span className="normal-case tracking-normal text-muted/70">(pasa el cursor para ver detalle)</span>
      </p>
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCard
          icon={TrendingUp}
          iconTone="text-primary"
          title="Inscripciones por mes"
          subtitle="Últimos 12 meses · altas en plataforma"
          className="lg:col-span-2"
        >
          {resumen ? <LineChart datos={resumen.inscripcionesPorMes} /> : <Cargando />}
        </ChartCard>

        <ChartCard title="Acceso a Plataforma" subtitle="Distribución de acceso activo">
          {resumen ? (
            <DonutChart
              datos={resumen.distribucionAcceso}
              total={resumen.totalClientes}
              colores={COLORES_DONA}
              centro={{
                valor: `${
                  resumen.totalClientes > 0
                    ? Math.round(
                        ((resumen.distribucionAcceso.find((d) => d.nombre.toLowerCase() === "si")?.cantidad ?? 0) /
                          resumen.totalClientes) *
                          100
                      )
                    : 0
                }%`,
                etiqueta: "activos",
              }}
            />
          ) : (
            <Cargando />
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard icon={GraduationCap} iconTone="text-primary" title="Top Membresías Skool" subtitle="Por número de registros">
          {resumen ? <BarChart datos={resumen.topMembresias} /> : <Cargando />}
        </ChartCard>

        <ChartCard icon={TrendingUp} iconTone="text-success" title="Crecimiento acumulado" subtitle="Total de contactos registrados en el tiempo">
          {resumen ? (
            <LineChart
              datos={resumen.inscripcionesPorMes.map((d) => ({ mes: d.mes, cantidad: d.acumulado }))}
              color="#10b981"
            />
          ) : (
            <Cargando />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function Cargando() {
  return <p className="flex h-full items-center justify-center text-sm text-muted">Cargando…</p>;
}

// Buscador rápido de Clientes del Club desde el Dashboard: busca por
// nombre/correo/teléfono (mismo criterio que el buscador de la lista de
// Clientes) y al elegir un resultado navega a /clientes?cliente=<id>, que
// abre el panel de ese cliente directo (ver el efecto que lee ese query
// param en clientes/page.tsx).
function BuscadorClientesDashboard() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<Cliente[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const id = setTimeout(() => {
      fetch(`/api/clientes?q=${encodeURIComponent(query)}&limite=8`)
        .then((r) => (r.ok ? r.json() : { clientes: [] }))
        .then((data) => setResultados(data.clientes ?? []))
        .catch(() => setResultados([]))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  function irACliente(id: string) {
    setAbierto(false);
    setQ("");
    router.push(`/clientes?cliente=${encodeURIComponent(id)}`);
  }

  return (
    <div ref={raiz} className="relative mb-8 max-w-md">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        placeholder="Buscar cliente por nombre, correo o teléfono…"
        className="w-full rounded-xl border border-silver bg-surface py-2.5 pl-10 pr-4 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
      />
      {abierto && q.trim() && (
        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-silver bg-surface shadow-lg">
          {buscando ? (
            <p className="px-4 py-3 text-sm text-muted">Buscando…</p>
          ) : resultados.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">Sin coincidencias.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {resultados.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => irACliente(c.id)}
                    className="ease-spring flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left text-sm transition hover:bg-surface-2"
                  >
                    <span className="font-medium text-foreground">{c.nombre}</span>
                    <span className="text-xs text-muted">
                      {c.email}
                      {c.telefono ? ` · ${c.telefono}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// El SVG se dibuja a la medida real del contenedor (medida con
// ResizeObserver) en vez de forzar un viewBox fijo a estirarse — así 1
// unidad del viewBox siempre es 1px real y nada se deforma, sea cual sea el
// tamaño final de la tarjeta.
function LineChart({
  datos,
  color = "#0a5cff",
}: {
  datos: { mes: string; cantidad: number }[];
  color?: string;
}) {
  const [contRef, { w: W, h: H }] = useTamanoContenedor<HTMLDivElement>();
  const listo = W > 0 && H > 0;

  const PAD_L = 42;
  const PAD_B = 22;
  const PAD_T = 14;
  const PAD_R = 12;
  const max = Math.max(1, ...datos.map((d) => d.cantidad));
  const anchoUtil = Math.max(1, W - PAD_L - PAD_R);
  const stepX = anchoUtil / Math.max(1, datos.length - 1);

  const puntos = datos.map((d, i) => {
    const x = PAD_L + i * stepX;
    const y = PAD_T + (1 - d.cantidad / max) * (H - PAD_T - PAD_B);
    return { x, y, ...d };
  });

  const linea = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${linea} L${puntos[puntos.length - 1]?.x ?? PAD_L},${H - PAD_B} L${PAD_L},${H - PAD_B} Z`;
  const gridY = [0, 0.25, 0.5, 0.75, 1];

  // Cuántos meses saltarse entre etiquetas para que nunca queden pegadas:
  // cada etiqueta necesita ~32px propios como mínimo.
  const saltoEtiqueta = Math.max(1, Math.ceil((32 * (datos.length - 1)) / anchoUtil));

  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || puntos.length === 0) return;
    const xSvg = ((e.clientX - rect.left) / rect.width) * W;
    let idx = 0;
    let mejor = Infinity;
    puntos.forEach((p, i) => {
      const d = Math.abs(p.x - xSvg);
      if (d < mejor) {
        mejor = d;
        idx = i;
      }
    });
    setHover(idx);
  }

  const activo = hover !== null ? puntos[hover] : null;
  const gradId = `areaFill-${color.replace("#", "")}`;

  return (
    <div ref={contRef} className="relative h-full w-full">
      {listo && (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-full w-full cursor-crosshair"
          role="img"
          aria-label="Gráfica de línea"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {gridY.map((g) => {
            const y = PAD_T + g * (H - PAD_T - PAD_B);
            return (
              <g key={g}>
                <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="var(--silver)" strokeWidth={1} />
                <text x={PAD_L - 8} y={y + 3} textAnchor="end" fontSize={11} fill="var(--muted)">
                  {Math.round(max * (1 - g)).toLocaleString("es-MX")}
                </text>
              </g>
            );
          })}
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradId})`} />
          <path d={linea} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {activo && (
            <line x1={activo.x} y1={PAD_T} x2={activo.x} y2={H - PAD_B} stroke="var(--silver)" strokeWidth={1} strokeDasharray="3,3" />
          )}
          {puntos.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={hover === i ? 5 : 3}
              fill={hover === i ? color : "var(--surface)"}
              stroke={color}
              strokeWidth={2}
            />
          ))}
          {puntos.map(
            (p, i) =>
              (i % saltoEtiqueta === 0 || i === puntos.length - 1) && (
                <text
                  key={i}
                  x={p.x}
                  y={H - 5}
                  textAnchor="middle"
                  fontSize={11}
                  fill={hover === i ? "var(--foreground)" : "var(--muted)"}
                >
                  {p.mes}
                </text>
              )
          )}
        </svg>
      )}
      {activo && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-lg border border-silver bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
          style={{ left: activo.x, top: activo.y }}
        >
          <p className="font-semibold text-foreground">{activo.cantidad.toLocaleString("es-MX")}</p>
          <p className="text-[10px] text-muted">{activo.mes}</p>
        </div>
      )}
    </div>
  );
}

