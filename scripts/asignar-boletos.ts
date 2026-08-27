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
    // .order("id") a propósito: sin un orden explícito y estable, Postgres
    // no garantiza que .range() devuelva las mismas filas en el mismo orden
    // entre una página y la siguiente — con escrituras de por medio (este
    // mismo script actualiza cada página apenas la lee) eso deja clientes
    // sin procesar, saltados entre el corte de una página y la otra.
    const { data, error } = await supabase
      .from("clientes")
      .select(
        "id,nombre,email,evento,pais,acceso_plataforma,tipo_membresia,fecha_inscripcion,fecha_renovacion,accesos_editado_manual"
      )
      .order("id", { ascending: true })
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
      // nombre/email van igual que ya estaban — solo van en el payload
      // porque son NOT NULL sin default: Postgres exige que el candidato de
      // INSERT del upsert (aunque termine resolviéndose como UPDATE por el
      // ON CONFLICT) cumpla esa restricción, así que omitirlas revienta con
      // "null value in column nombre" para cada fila, aunque ya exista.
      return {
        id: c.id,
        nombre: c.nombre,
        email: c.email,
        accesos,
        boletos_sin_informacion: sinInformacion,
        actualizado_en: ahora,
      };
    });

    // upsert: como las filas ya existen (vienen de esta misma tabla),
    // ON CONFLICT las actualiza — nombre/email/accesos/boletos_sin_
    // informacion/actualizado_en, el resto de columnas queda intacto.
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
