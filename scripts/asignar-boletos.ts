import "./_env";
import { supabase } from "../src/lib/supabase";
import { cargarInventarioBoletos, calcularAccesos } from "../src/lib/boletos";

const PAGINA = 1000;

async function main() {
  const inventario = await cargarInventarioBoletos();

  let sinInfo = 0;
  let conAlgunAcceso = 0;
  let total = 0;
  let saltados = 0;
  let from = 0;
  const ahora = new Date().toISOString();

  for (;;) {
    const { data, error } = await supabase
      .from("clientes")
      .select(
        "id,evento,pais,acceso_plataforma,tipo_membresia,fecha_inscripcion,fecha_renovacion,accesos_editado_manual"
      )
      .range(from, from + PAGINA - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    // Un cliente con accesos_editado_manual tiene sus boletos corregidos a
    // mano por un admin — el job masivo no los pisa (misma regla que
    // recalcularAccesos, ver src/lib/db.ts).
    const editables = data.filter((c) => !c.accesos_editado_manual);
    saltados += data.length - editables.length;

    const actualizaciones = editables.map((c) => {
      const { accesos, sinInformacion } = calcularAccesos(
        {
          evento: c.evento,
          pais: c.pais,
          accesoPlataforma: c.acceso_plataforma,
          tipoMembresia: c.tipo_membresia,
          fechaInscripcion: c.fecha_inscripcion,
          fechaRenovacion: c.fecha_renovacion,
        },
        inventario
      );
      if (accesos.general.length || accesos.vip.length || accesos.black.length) conAlgunAcceso++;
      if (sinInformacion) sinInfo++;
      return { id: c.id, accesos, boletos_sin_informacion: sinInformacion, actualizado_en: ahora };
    });

    // upsert con solo estas columnas: como las filas ya existen (vienen de
    // esta misma tabla), PostgREST solo actualiza id/accesos/boletos_sin_
    // informacion/actualizado_en — el resto de columnas queda intacto.
    if (actualizaciones.length) {
      const { error: errUpdate } = await supabase
        .from("clientes")
        .upsert(actualizaciones, { onConflict: "id" });
      if (errUpdate) throw errUpdate;
    }

    total += data.length;
    process.stdout.write(`\rProcesados: ${total}`);
    if (data.length < PAGINA) break;
    from += PAGINA;
  }

  console.log();
  console.log(`Accesos recalculados para ${total - saltados} clientes.`);
  console.log(`  Saltados por tener accesos editados a mano: ${saltados}`);
  console.log(`  Con al menos un acceso activo: ${conAlgunAcceso}`);
  console.log(`  Sin información de boletos (evento no está en el inventario): ${sinInfo}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
