import { notFound } from "next/navigation";
import { EstadisticasContenido } from "@/components/community-manager/EstadisticasContenido";
import type { Plataforma } from "@/components/community-manager/mock-data";

const PLATAFORMAS_VALIDAS: Plataforma[] = ["facebook", "instagram", "tiktok", "skool"];

export default async function CommunityManagerPlataformaPage({
  params,
}: {
  params: Promise<{ plataforma: string }>;
}) {
  const { plataforma } = await params;
  if (!PLATAFORMAS_VALIDAS.includes(plataforma as Plataforma)) notFound();
  return <EstadisticasContenido plataforma={plataforma as Plataforma} />;
}
