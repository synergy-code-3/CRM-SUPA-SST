import { redirect } from "next/navigation";

// El perfil de un socio ahora es un panel lateral sobre la lista
// (ClienteCertificacionPanel) — esta ruta se conserva solo para no romper
// links viejos.
export default async function PerfilCertificacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/certificaciones?id=${id}`);
}
