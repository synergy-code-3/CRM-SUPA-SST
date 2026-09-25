"use client";

import Image from "next/image";
import Link from "next/link";
import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Bell, Plus } from "lucide-react";
import { useSesion } from "@/lib/session-context";
import { FiltrosMovilProvider } from "@/lib/filtros-movil-context";
import { Sidebar, useConteosPendientes } from "@/components/Sidebar";
import { CertificacionActualProvider, useCertificacionActual } from "@/lib/certificacion-actual-context";
import { CERTIFICACIONES } from "./constantes";

// Shell de Certificaciones (Legendar-IA): el mismo menú lateral del Club
// (Sidebar, que ya trae el workspace de Certificaciones con su logo y sus
// herramientas) y, encima del contenido, la barra superior del CRM original
// con la pastilla de la certificación y la campana. Solo aplica bajo
// /certificaciones (ver (app)/layout.tsx); el Club queda intacto.
export function CertificacionesShell({ children }: { children: ReactNode }) {
  const { usuario } = useSesion();
  const conteos = useConteosPendientes(usuario);

  return (
    <CertificacionActualProvider>
    <FiltrosMovilProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-background bg-mesh md:flex-row">
        <Sidebar />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-6xl">
            <div className="sticky -top-5 z-20 -mx-4 -mt-5 bg-background px-4 pb-4 pt-5 sm:-mx-6 sm:px-6 md:-top-8 md:-mx-8 md:-mt-8 md:px-8 md:pt-8">
              <BarraCertificacion cantidadAvisos={conteos.avisos} />
            </div>
            <div className="animate-fade-in pt-2">{children}</div>
          </div>
        </main>
      </div>
    </FiltrosMovilProvider>
    </CertificacionActualProvider>
  );
}

function BarraCertificacion({ cantidadAvisos }: { cantidadAvisos: number }) {
  const router = useRouter();
  const { certificacionActual, setCertificacionActual } = useCertificacionActual();
  return (
    <div className="shell rounded-[1.75rem] p-2 diffused">
      <div className="core flex flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden rounded-[calc(1.75rem-0.5rem)] p-2">
        {CERTIFICACIONES.map((cert) => {
          const activa = certificacionActual === cert.id;
          return (
            <button
              key={cert.id}
              onClick={() => {
                setCertificacionActual(cert.id);
                router.push("/certificaciones");
              }}
              title={`Ver solo ${cert.nombre}`}
              aria-pressed={activa}
              className={`flex h-11 flex-none items-center overflow-visible rounded-2xl bg-primary px-4 shadow-[0_10px_24px_-8px_rgba(10,92,255,0.5)] transition-all duration-500 ease-spring ${
                activa ? "ring-2 ring-primary-deep ring-offset-2 ring-offset-surface" : "opacity-90 hover:opacity-100"
              }`}
            >
              {cert.logo ? (
                <span className="relative h-24 w-32 flex-none">
                  <Image src={cert.logo} alt={cert.nombre} fill sizes="128px" className="object-contain" />
                </span>
              ) : (
                <span className="text-sm font-medium text-white">{cert.nombre}</span>
              )}
            </button>
          );
        })}
        <span
          title="Agregar certificación (próximamente)"
          className="flex h-11 flex-none cursor-not-allowed items-center gap-1.5 rounded-2xl border border-dashed border-silver-deep/60 px-3 py-2.5 text-xs font-medium text-muted/60"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          Agregar
        </span>
        <Link
          href="/certificaciones/avisos"
          aria-label="Avisos"
          title="Avisos"
          className="relative ml-auto flex h-11 w-11 flex-none items-center justify-center rounded-2xl border border-silver-deep/60 bg-surface-2 text-muted transition-all duration-500 ease-spring hover:text-primary"
        >
          <Bell className="h-4 w-4" strokeWidth={1.75} />
          {cantidadAvisos > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium text-white">
              {cantidadAvisos > 9 ? "9+" : cantidadAvisos}
            </span>
          )}
        </Link>
      </div>
    </div>
  );
}
