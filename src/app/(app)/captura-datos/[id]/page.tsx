import { EventoDetalle } from "@/components/captura-datos/EventoDetalle";

export default async function EventoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventoDetalle id={id} />;
}
