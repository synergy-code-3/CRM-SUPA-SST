import { notFound } from "next/navigation";
import { ModeracionContenido } from "@/components/community-manager/ModeracionContenido";
import type { Plataforma } from "@/components/community-manager/mock-data";

const PLATAFORMAS_VALIDAS: Plataforma[] = ["facebook", "instagram", "tiktok", "skool"];

export default async function ModeracionPlataformaPage({
  params,
}: {
  params: Promise<{ plataforma: string }>;
}) {
  const { plataforma } = await params;
  if (!PLATAFORMAS_VALIDAS.includes(plataforma as Plataforma)) notFound();
  return <ModeracionContenido plataforma={plataforma as Plataforma} />;
}
