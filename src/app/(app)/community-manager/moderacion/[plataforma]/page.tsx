import { notFound } from "next/navigation";
import { ModeracionContenido } from "@/components/community-manager/ModeracionContenido";
import { PLATAFORMAS_VALIDAS, type Plataforma } from "@/lib/community-manager";

export default async function ModeracionPlataformaPage({
  params,
}: {
  params: Promise<{ plataforma: string }>;
}) {
  const { plataforma } = await params;
  if (!PLATAFORMAS_VALIDAS.includes(plataforma as Plataforma)) notFound();
  return <ModeracionContenido plataforma={plataforma as Plataforma} />;
}
