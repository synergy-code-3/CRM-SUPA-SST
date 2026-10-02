import { notFound } from "next/navigation";
import { EstadisticasContenido } from "@/components/community-manager/EstadisticasContenido";
import { EstadisticasSkoolContenido } from "@/components/community-manager/EstadisticasSkoolContenido";
import { PLATAFORMAS_VALIDAS, type Plataforma } from "@/lib/community-manager";

export default async function CommunityManagerPlataformaPage({
  params,
}: {
  params: Promise<{ plataforma: string }>;
}) {
  const { plataforma } = await params;
  if (!PLATAFORMAS_VALIDAS.includes(plataforma as Plataforma)) notFound();
  if (plataforma === "skool") return <EstadisticasSkoolContenido />;
  return <EstadisticasContenido plataforma={plataforma as Plataforma} />;
}
