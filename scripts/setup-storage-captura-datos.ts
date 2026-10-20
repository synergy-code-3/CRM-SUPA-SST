// Crea los buckets privados de Supabase Storage de Captura de Datos:
// cap-fotos (fotos de hojas subidas desde la computadora) y cap-excel
// (última copia del Excel generado por evento). Idempotente. Mismo criterio
// que setup-storage-comprobantes.ts (fetch directo, sin @supabase/supabase-js,
// para evitar el RealtimeClient que revienta en Node 20 sin WebSocket global).
//
// Uso: npx tsx scripts/setup-storage-captura-datos.ts
import "./_env";

const BUCKETS = [
  { name: "cap-fotos", file_size_limit: "15MB" },
  { name: "cap-excel", file_size_limit: "20MB" },
];

async function main() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) throw new Error("Faltan SUPABASE_URL / SUPABASE_SECRET_KEY");

  const headers = {
    Authorization: `Bearer ${secretKey}`,
    apikey: secretKey,
    "Content-Type": "application/json",
  };

  const resLista = await fetch(`${url}/storage/v1/bucket`, { headers });
  if (!resLista.ok) throw new Error(`No se pudo listar buckets: ${resLista.status} ${await resLista.text()}`);
  const buckets = (await resLista.json()) as { name: string }[];

  for (const b of BUCKETS) {
    if (buckets.some((x) => x.name === b.name)) {
      console.log(`El bucket "${b.name}" ya existe.`);
      continue;
    }
    const resCrear = await fetch(`${url}/storage/v1/bucket`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: b.name, public: false, file_size_limit: b.file_size_limit }),
    });
    if (!resCrear.ok) throw new Error(`No se pudo crear "${b.name}": ${resCrear.status} ${await resCrear.text()}`);
    console.log(`Bucket "${b.name}" creado (privado).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
