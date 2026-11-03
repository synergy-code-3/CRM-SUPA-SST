# Plan de pruebas y optimización de la base de datos

Para: la persona con acceso a Supabase y su Claude Code. Quien lo escribió no tiene acceso a la base. Todo el SQL de este documento se probó en un Postgres 17 desechable (Docker) con datos sintéticos, nunca contra producción, y pasó tres rondas de revisión independiente (SQL, ejecutabilidad, seguridad y fallos silenciosos). Sus hallazgos están incorporados.

## Estado de ejecución (3 nov 2026)

Aplicado en producción: `schema.sql` completo (tabla `cap_evento_capturistas`, `registrar_capturista`, nueva `tomar_hoja_libre`, índices de búsqueda y de hojas de cliente), la fase 2 (limpieza de constraints) y la fase 3 (4 índices nuevos), todo verificado sin errores. Fases 4 y 5: no se hicieron ni hacen falta (base de ~50 MB, ~10 % de filas muertas en `clientes`, autovacuum al día).

Lecciones del día:
- **La prueba local debe incluir filas reales de `catalogo_opciones` con todos los tipos** (`motivo_cm`, `palabra_descartada_cm`, `tag_certificaciones`). El `schema.sql` anterior recreaba el constraint en pasos intermedios más restrictivos y falló en producción con `23514 ... violated by some row`, algo que una base de pruebas vacía no muestra. El SQL Editor revirtió todo el intento fallido (el constraint siguió presente y validado).
- Al copiar consultas al SQL Editor se puede perder la primera letra (`elect`). Tras ejecutar un bloque, repetir la consulta de definiciones (`indexdef`) cubre el caso en que la comprobación previa no corrió.

## 0. Reglas (si eres Claude, son obligatorias)

1. **Todo el SQL vive en `supabase/schema.sql`.** No crees archivos `.sql` aparte. Los bloques de las fases 2 y 3 se agregan **al final** de `schema.sql` (ver §4 y §5).
2. **Claude nunca recibe credenciales ni ejecuta SQL en producción.** Solo prepara y prueba en local; la persona ejecuta en el SQL Editor y pega el resultado. Cada `drop`, `alter`, `create`, `vacuum` o cambio sobre producción exige una confirmación explícita de la persona **en ese turno**; la aprobación general del plan no basta.
3. **Una fase a la vez, y cada bloque SQL por separado.** Después de cada bloque se verifica (§6) antes de continuar. Si un bloque falla, no se ejecuta el siguiente.
4. **No se borra ni modifica ningún dato.** Solo índices y constraints. Si una sentencia lo hiciera, detener todo y avisar.
5. **No quitar un índice porque "parece que no se usa".** Solo con la evidencia de la §7.
6. **Prohibido:** `git checkout`/`git restore`/`git reset` sobre `schema.sql` (podría borrar el trabajo de este plan antes de commitearlo; ver §1), `vacuum full`, `drop table`, `truncate`, `pg_stat_reset()`, cambiar parámetros globales del servidor y borrar un índice inválido sin permiso explícito.
7. Sin commit ni rama nueva hasta que la persona lo pida.
8. **Datos sensibles:** nunca pegar a Claude una cadena de conexión, contraseña, token ni el volcado de la base. Los resultados de consultas se pegan en la conversación (no en el repo) y solo si no contienen datos personales (ver nota de 0.7).
9. Modificar el `prelude` de la §3 o cualquier otro entorno de prueba requiere avisar y esperar confirmación.

## 1. Antes de empezar

- [ ] **Respaldo de `schema.sql`:** copiar el archivo **entero** a una carpeta persistente fuera del repo (`mkdir -p ~/respaldo-bd && cp supabase/schema.sql ~/respaldo-bd/schema.sql.original`) y anotar la ruta. El `schema.sql` de partida ya incluye los 2 índices de `cap_hojas` (hojas de cliente) y los 3 buckets privados de Storage, que antes vivían en `supabase/indices-hojas-cliente.sql` (eliminado a propósito: no restaurarlo). Todo cambio al archivo se revierte con esa copia, nunca con `git checkout`.
- [ ] **Respaldo de la base:** Supabase → Database → Backups (los respaldos diarios dependen del plan; el Free no los incluye). Si no hay uno reciente, la persona hace uno manual con `supabase db dump` o `pg_dump` **ella misma**, con la contraseña en `PGPASSWORD`/`~/.pgpass` (nunca en la línea de comandos pegada a Claude), y guarda el archivo fuera del repo. Ese archivo no se le pasa a Claude.
- [ ] Elegir una hora de poco uso. Crear índices bloquea las escrituras de esa tabla mientras se construyen (en local, con 60 000 filas, tardó ~30 ms; producción puede variar) y el cron de Kajabi escribe en `clientes` cada 15 minutos.
- [ ] Hacer la fase 0 antes de cambiar nada.

## 2. Fase 0: línea base (solo lectura)

Correr **cada consulta por separado** en el SQL Editor (si una falla, no aborta las demás). Ninguna modifica ni resetea estadísticas. Pegar a Claude solo resultados sin datos personales.

```sql
-- 0.1 Desde cuándo se acumulan las estadísticas
select stats_reset from pg_stat_database where datname = current_database();

-- 0.2 Respaldo de TODAS las definiciones de índices (permite revertir cualquier fase)
select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2;

-- 0.3 Respaldo de constraints (permite revertir los constraints de la fase 2)
select conrelid::regclass as tabla, conname, convalidated, pg_get_constraintdef(oid) as definicion
from pg_constraint where connamespace = 'public'::regnamespace and contype in ('c','f','u') order by 1, 2;

-- 0.4 Tamaño y filas por tabla
select relname, n_live_tup, n_dead_tup, last_autovacuum, last_autoanalyze,
       pg_size_pretty(pg_total_relation_size(relid)) as total
from pg_stat_user_tables order by pg_total_relation_size(relid) desc;

-- 0.5 Uso de índices (nunca usados primero; indisunique = true es PK/unique: no se quita)
select s.relname as tabla, s.indexrelname as indice, s.idx_scan, i.indisunique,
       pg_size_pretty(pg_relation_size(s.indexrelid)) as tamano
from pg_stat_user_indexes s join pg_index i on i.indexrelid = s.indexrelid
order by s.idx_scan, pg_relation_size(s.indexrelid) desc;

-- 0.6 Índices inválidos (deben ser 0 filas)
select indexrelid::regclass from pg_index where not indisvalid;

-- 0.7 Consultas más pesadas. OPCIONAL. Puede dar error si la extensión no está activa o estar en el esquema "extensions".
--     Las consultas con valores escritos directamente (no parametrizadas) pueden mostrar correos, teléfonos o tokens:
--     la persona revisa la columna q y borra esos valores antes de pegar; si no puede, omite esta consulta.
select left(query, 140) as q, calls, round(mean_exec_time::numeric, 1) as ms_prom, round(total_exec_time::numeric) as ms_total
from pg_stat_statements order by total_exec_time desc limit 15;
```

Además: Dashboard → Advisors → Performance; pegar lo que marque.

**Criterio para continuar:** 0.6 sin filas y respaldos confirmados.
**Ojo con 0.1:** `stats_reset` no refleja reinicios, pausas o restauraciones del proyecto; `idx_scan` puede haber arrancado de cero sin avisar. Por eso la fase 4 exige más que un `idx_scan = 0`.

## 3. Fase 1: pruebas en local (sin tocar producción)

Claude prueba el archivo completo en un Postgres desechable. Requiere Docker. Ejecutar **desde la raíz del repo**. Se usa un nombre de contenedor propio y se registra el digest de la imagen para poder reproducirlo.

```bash
D=$(mktemp -d); echo "carpeta de trabajo: $D"          # fuera del repo
C=pgtest_$RANDOM                                         # nombre único: nunca borra un contenedor ajeno
docker pull postgres:17-alpine && docker image inspect postgres:17-alpine --format '{{index .RepoDigests 0}}'   # anotar el digest en el reporte
cat > "$D/prelude.sql" <<'EOF'
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false);
EOF
docker run -d --name "$C" -e POSTGRES_PASSWORD=x postgres:17-alpine
# espera real: el contenedor reinicia el servidor tras inicializar, y pg_isready puede dar un falso positivo
until docker exec "$C" psql -U postgres -Atqc "select 1" >/dev/null 2>&1; do sleep 1; done; sleep 2
docker exec -i "$C" psql -U postgres -v ON_ERROR_STOP=1 -q < "$D/prelude.sql" || echo "FALLO: prelude"
for n in 1 2; do
  docker exec -i "$C" psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/schema.sql > "$D/out$n.txt" 2>&1 \
    || { echo "FALLO en la corrida $n"; grep -m3 ERROR "$D/out$n.txt"; }
done
docker exec "$C" psql -U postgres -Atc "select count(*) from pg_indexes where schemaname='public'"
```

**Criterio de éxito:** ninguna línea `FALLO` (se basa en el código de salida de `psql`, no en buscar texto: si Docker o el contenedor fallan, también se ve). El esquema **original** deja **118** índices; con los cambios de este plan el total es otro (121) y lo que importa es que no haya fallos y que la 2.ª corrida no cambie nada. Si falla por una dependencia de Supabase que el `prelude` no simula (otro rol o esquema), avisar a la persona antes de modificarlo (regla 9). Al terminar: `docker rm -f "$C"`.

**Comparar estados** (en cada fase, antes y después; incluye índices con su validez, constraints con su validez, funciones con permisos, RLS, grants, políticas, columnas y buckets). El número de líneas con `ERROR` debe ser 0:

```bash
cat > "$D/snap.sh" <<'EOF'
q(){ docker exec "$C" psql -U postgres -Atqc "$1"; }
q "select 'idx '||tablename||'.'||indexname||' '||indexdef||' valid='||(select indisvalid from pg_index where indexrelid=(schemaname||'.'||indexname)::regclass) from pg_indexes where schemaname='public' order by tablename, indexname"
q "select 'con '||conrelid::regclass||' '||conname||' '||contype::text||' val='||convalidated||' '||pg_get_constraintdef(oid) from pg_constraint where connamespace='public'::regnamespace order by conrelid::regclass::text, conname"
q "select 'fn '||p.proname||' secdef='||p.prosecdef||' acl='||coalesce(p.proacl::text,'')||' '||md5(pg_get_functiondef(p.oid)) from pg_proc p where pronamespace='public'::regnamespace order by 1"
q "select 'rls '||relname||' '||relrowsecurity||' acl='||coalesce(relacl::text,'') from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname"
q "select 'pol '||tablename||' '||policyname from pg_policies where schemaname='public' order by 1"
q "select 'col '||table_name||'.'||column_name||' '||data_type||' '||coalesce(column_default,'')||' '||is_nullable from information_schema.columns where table_schema='public' order by table_name, ordinal_position"
q "select 'bkt '||id||' '||public from storage.buckets order by id"
EOF
C="$C" bash "$D/snap.sh" > "$D/antes.txt" 2>&1; grep -c ERROR "$D/antes.txt"    # debe imprimir 0
# ... aplicar la fase ...   C="$C" bash "$D/snap.sh" > "$D/despues.txt" 2>&1; diff "$D/antes.txt" "$D/despues.txt"
```
Éxito de un rollback = `diff` vacío contra el estado previo a la fase (con la salvedad de los constraints de la §4, que se corrigen a propósito y no se revierten).

**Prueba de rendimiento opcional** (60 000 clientes, 20 000 otras ofertas y 20 000 hojas sintéticos; `explain (analyze, costs off)` antes y después). Resultados al escribir este plan, **sintéticos, no de producción**:

| Consulta | Antes | Después |
|---|---|---|
| Apartados vencidos (`listarApartadosVencidos`, db.ts:1420) | Seq Scan + Sort | Index Scan, 0.77 ms |
| Filtro de Etiquetas de Clientes (db.ts:406-408) | Seq Scan, 19.5 ms | Index Scan, 0.04 ms (también en el `or` con `id.in`) |

## 4. Fase 2: limpieza

Qué hace:
- Quita `idx_avisos_confirmaciones_aviso_id` **solo si** el `unique (aviso_id, usuario_id)` existe en esa base (lo cubre: `aviso_id` es la columna líder).
- Los constraints que hoy se borran y recrean en **cada** ejecución del archivo se recrean solo si no existen, no están validados o su definición difiere **exactamente** de la final (antes, cada ejecución tomaba un lock exclusivo y revalidaba la tabla). Se recrean con `not valid` y luego `validate`, que usa un lock mucho más ligero. Si la definición exacta cambia entre versiones de Postgres, lo peor que pasa es que se recrea una vez más (seguro).

**Cómo editar `schema.sql`** (las tablas deben existir cuando corre el bloque, por eso va al final):

1. **Borrar** estas sentencias (buscarlas por texto; los números de línea son aproximados):
   - Los 3 pares `drop constraint … catalogo_opciones_tipo_check` + `add constraint …` (~líneas 612-627; el bloque nuevo reproduce la lista completa de 7 tipos del último par).
   - El par de `solicitudes_cliente_estado_check` (~665-667).
   - El par de `cm_comentarios_accion_check` (~839-840).
   - El par del FK `cap_eventos_reaperturas_evento_id_fkey` (~1091-1093; mover su comentario de ~1090 junto al bloque nuevo).
   - `create index if not exists idx_avisos_confirmaciones_aviso_id …` (~495). **Si no se borra, se recrea en cada corrida.**
2. **Agregar al final del archivo** el bloque siguiente.
3. **NO borrar** `alter table cap_eventos add column if not exists fecha date;` (~1258): es lo que agrega la columna en bases creadas antes de existir esa fecha, y el código la usa. Solo opcional: cambiar "Correr una sola vez" del encabezado por "Idempotente: se puede correr completo cuantas veces haga falta".

```sql
-- OPTIMIZACIÓN FASE 2 — limpieza (idempotente)
begin;
set local lock_timeout = '3s'; -- si hay una transacción larga abierta falla en vez de bloquear a la app: reintentar luego

do $$
begin
  -- El índice solo sobra si el unique (aviso_id, usuario_id) existe de verdad en esta base.
  if exists (select 1 from pg_constraint where conrelid = 'avisos_confirmaciones'::regclass and contype = 'u'
             and pg_get_constraintdef(oid) = 'UNIQUE (aviso_id, usuario_id)') then
    drop index if exists public.idx_avisos_confirmaciones_aviso_id;
  end if;

  -- Cada constraint se recrea solo si NO existe, no está validado o su definición difiere EXACTAMENTE de la final.
  if not exists (select 1 from pg_constraint where conrelid = 'catalogo_opciones'::regclass and conname = 'catalogo_opciones_tipo_check' and convalidated
      and pg_get_constraintdef(oid) = 'CHECK ((tipo = ANY (ARRAY[''evento''::text, ''etiqueta''::text, ''tag''::text, ''certificacion''::text, ''tag_certificaciones''::text, ''motivo_cm''::text, ''palabra_descartada_cm''::text])))') then
    alter table catalogo_opciones drop constraint if exists catalogo_opciones_tipo_check;
    alter table catalogo_opciones add constraint catalogo_opciones_tipo_check
      check (tipo in ('evento','etiqueta','tag','certificacion','tag_certificaciones','motivo_cm','palabra_descartada_cm')) not valid;
    alter table catalogo_opciones validate constraint catalogo_opciones_tipo_check;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'solicitudes_cliente'::regclass and conname = 'solicitudes_cliente_estado_check' and convalidated
      and pg_get_constraintdef(oid) = 'CHECK ((estado = ANY (ARRAY[''pendiente''::text, ''aprobada''::text, ''rechazada''::text, ''correo_invalido''::text])))') then
    alter table solicitudes_cliente drop constraint if exists solicitudes_cliente_estado_check;
    alter table solicitudes_cliente add constraint solicitudes_cliente_estado_check
      check (estado in ('pendiente','aprobada','rechazada','correo_invalido')) not valid;
    alter table solicitudes_cliente validate constraint solicitudes_cliente_estado_check;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'cm_comentarios'::regclass and conname = 'cm_comentarios_accion_check' and convalidated
      and pg_get_constraintdef(oid) = 'CHECK ((accion = ANY (ARRAY[''Sin acción''::text, ''Eliminado''::text, ''Respuesta''::text])))') then
    alter table cm_comentarios drop constraint if exists cm_comentarios_accion_check;
    alter table cm_comentarios add constraint cm_comentarios_accion_check check (accion in ('Sin acción','Eliminado','Respuesta')) not valid;
    alter table cm_comentarios validate constraint cm_comentarios_accion_check;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'cap_eventos_reaperturas'::regclass and conname = 'cap_eventos_reaperturas_evento_id_fkey' and convalidated
      and pg_get_constraintdef(oid) = 'FOREIGN KEY (evento_id) REFERENCES cap_eventos(id) ON DELETE CASCADE') then
    alter table cap_eventos_reaperturas drop constraint if exists cap_eventos_reaperturas_evento_id_fkey;
    alter table cap_eventos_reaperturas add constraint cap_eventos_reaperturas_evento_id_fkey
      foreign key (evento_id) references cap_eventos (id) on delete cascade not valid;
    alter table cap_eventos_reaperturas validate constraint cap_eventos_reaperturas_evento_id_fkey;
  end if;
end $$;
commit;
```

**Verificación en producción tras el bloque** (esperado: 4 filas, todas `convalidated = t` y con la definición del bloque; y 0 filas en la segunda consulta si el `unique` existe):
```sql
select conname, convalidated, pg_get_constraintdef(oid) from pg_constraint
where conname in ('catalogo_opciones_tipo_check','solicitudes_cliente_estado_check','cm_comentarios_accion_check','cap_eventos_reaperturas_evento_id_fkey');
select indexname from pg_indexes where indexname = 'idx_avisos_confirmaciones_aviso_id';
```
Un `commit` dentro de una transacción abortada hace rollback y el editor puede mostrar "Success": por eso esta verificación es obligatoria, no opcional.

**Rollback:** solo el índice se revierte; los constraints quedan en su definición final correcta (si se necesita volver a la definición anterior de alguno, usar literalmente la de 0.3).
```sql
-- ROLLBACK FASE 2
create index if not exists idx_avisos_confirmaciones_aviso_id on avisos_confirmaciones (aviso_id);
```
Más la copia de `schema.sql` de la §1 para el archivo.

**Prueba local obligatoria antes de ejecutar** (con el `snap` de la §3): (a) instalación limpia (`prelude` + `schema.sql` editado) dos veces sin `FALLO`; (b) actualización: cargar primero el `schema.sql` **original** y luego el editado, dos veces sin `FALLO`; (c) `snap` de (a) y (b) idénticos; (d) con filas en las tablas, el conteo no cambia; (e) con filas en `catalogo_opciones` de **todos** los tipos que usa la app (incluidos `motivo_cm` y `palabra_descartada_cm`), tanto con el constraint presente como con el constraint borrado. Ya se verificó con este bloque exacto (incluido el caso de un `catalogo_opciones_tipo_check` con otro orden, que se corrige).

## 5. Fase 3: índices nuevos

Cada uno respalda una consulta real del código. **Antes** de ejecutar, comprobar que no existan ya con otra definición (si salen filas, comparar su `indexdef` con la del bloque; si difiere, detener y avisar, porque `if not exists` lo omitiría sin avisar):
```sql
select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname in
 ('idx_clientes_etiqueta','idx_clientes_apartado_50_en','idx_otras_ofertas_clientes_etiqueta','idx_otras_ofertas_clientes_tags');
```
Esperado: 0 filas.

Agregar **al final** de `schema.sql`, después de la fase 2:

```sql
-- OPTIMIZACIÓN FASE 3 — índices nuevos (idempotente)
begin;
set local lock_timeout = '3s';
-- Filtro de Etiquetas en Clientes (db.ts:406-408): sin índice, seq scan.
create index if not exists idx_clientes_etiqueta on clientes (etiqueta) where etiqueta is not null;
-- listarApartadosVencidos (db.ts:1420-1427)
create index if not exists idx_clientes_apartado_50_en on clientes (apartado_50_en) where apartado_50 and eliminado_en is null;
-- Otras Ofertas: filtros por etiqueta y tag (db.ts:2702-2703, 2738-2739)
create index if not exists idx_otras_ofertas_clientes_etiqueta on otras_ofertas_clientes (etiqueta) where etiqueta is not null;
create index if not exists idx_otras_ofertas_clientes_tags on otras_ofertas_clientes using gin (tags);
commit;

analyze clientes;
analyze otras_ofertas_clientes;
```

**Verificación tras el bloque:** repetir la consulta de arriba (esperado: 4 filas con la definición del bloque) y la 0.6 (0 filas, ningún índice inválido). Si una creación falló a medias deja un índice `INVALID` que `if not exists` omite: pedir permiso explícito, `drop index public.<nombre>;` y repetir.

**Rollback:**
```sql
-- ROLLBACK FASE 3
drop index if exists public.idx_clientes_etiqueta, public.idx_clientes_apartado_50_en,
  public.idx_otras_ofertas_clientes_etiqueta, public.idx_otras_ofertas_clientes_tags;
```

**Comprobar en producción que el planner los usa** (con ~25k filas puede seguir prefiriendo un seq scan aunque el índice exista; si es así, el índice solo cuesta espacio y se quita con su rollback):
```sql
explain select id from clientes where etiqueta in ('BECA','MBA');
explain select id from clientes where apartado_50 and apartado_50_en <= now() - interval '30 days' and eliminado_en is null order by apartado_50_en;
explain select id from otras_ofertas_clientes where etiqueta = 'BECA';
explain select id from otras_ofertas_clientes where tags @> '["x"]'::jsonb;
```
Un `Index Scan`/`Bitmap Index Scan` sobre el índice nuevo = éxito. Si sale `Seq Scan`, repetir tras `analyze`; si persiste, no es un fallo, solo significa que a ese tamaño no aporta (con una etiqueta que cubre la mitad de la tabla, es normal que el planner prefiera otro plan).

**Índices y cambios que se probaron y se DESCARTARON a propósito:**
- `clientes (revisado_oferta_en)`: el cron de Kajabi actualiza esa columna en cada candidato cada ~15 min (tope de 30 por corrida); indexarla haría esas actualizaciones no-HOT y aumentaría el bloat de `clientes`, a cambio de acelerar una consulta que solo devuelve 30 filas.
- `clientes (id) where guarda_acceso_su27`: solo acelera una pestaña poco usada y el planner puede preferir otro índice por el orden.
- Cambiar el predicado del índice de folio (`idx_cap_hojas_folio_confirmada`, quitando `folio <> ''`): con el índice actual el planner ya lo usa en el caso normal; solo mejoraría con planes genéricos con parámetro, y el cambio exige un `drop` + `create` que bloquea las búsquedas por folio. No vale el riesgo.
- Un índice parcial para el orden de `tomar_hoja_libre` y uno de `certificaciones_clientes (eliminado, revocado)`: sin mejora medible.

## 6. Verificación después de cada bloque

1. 0.6: cero índices inválidos.
2. La verificación específica de la fase (consultas de §4 o §5).
3. Repetir 0.2 y 0.3 y comparar con las de antes: solo deben diferir los objetos de la fase.
4. En la app (la persona a la vista): Clientes con filtro de Etiquetas, Otras Ofertas con etiqueta y tag, Certificaciones, Captura de Datos (abrir un evento, tomar una hoja, buscar por folio), Solicitudes (incluido marcar una con correo inválido) y Avisos.
5. `npx tsc --noEmit` (no debería cambiar). `npm test` crea una carpeta `coverage/` sin seguimiento en Git: no commitearla.
6. Supabase → Logs: sin errores nuevos de Postgres durante los 15 minutos siguientes (un ciclo del cron de Kajabi).

**Si algo falla:** ejecutar el ROLLBACK de esa fase, pegar a Claude el mensaje de error exacto y no avanzar.

## 7. Fase 4 (opcional): quitar índices solo con evidencia

Solo si se cumple **todo**: `stats_reset` con más de 30 días **y** sin sospecha de reinicio/restauración reciente, `idx_scan = 0`, `indisunique = false`, el índice no respalda un filtro real del código (buscar la columna en `src/lib/db.ts`) y la persona lo aprueba explícitamente para ese índice.

Ojo: `idx_clientes_region` y `idx_clientes_evento` respaldan filtros reales (db.ts:385 y 392); un `idx_scan = 0` solo indicaría baja selectividad, no que sobren. Candidatos más plausibles: `idx_eventos_tipo`, `idx_clientes_acceso_plataforma` (btree; el trigram lo reemplaza para `ilike`; confirmar que ningún código use `eq` sobre esa columna) e `idx_clientes_eliminado_en`.

Un índice por vez, en su propia transacción, dejando su `create index` original (definición exacta de 0.2) comentado en `schema.sql` como rollback. Observar unos días antes del siguiente.

## 8. Fase 5 (opcional): mantenimiento con datos

Solo si 0.4 muestra problemas, y cada sentencia requiere aprobación explícita de la persona (regla 2):
- `n_dead_tup` alto y `last_autovacuum` viejo → `vacuum (analyze) <tabla>;` **como única sentencia del script** (no puede ir dentro de una transacción y el SQL Editor puede envolver los scripts en una).
- Autovacuum atrasado en `clientes` → `alter table clientes set (autovacuum_vacuum_scale_factor = 0.05);` Rollback: `alter table clientes reset (autovacuum_vacuum_scale_factor);`
- Nunca `vacuum full`.

## 9. Reporte de cierre (pegar a quien pidió el trabajo)

```
Fase 0: respaldo de schema.sql [sí/no] · respaldo de BD [sí/no] · índices inválidos: [n] · stats_reset: [fecha]
Fase 1 (local): digest de la imagen [sha256:…] · limpia x2 [ok/FALLO] · actualización x2 [ok/FALLO] · diff de snapshots [vacío/…]
Fase 2: ejecutada [fecha/hora] · errores: [ninguno/…] · 4 constraints validados [sí/no] · verificación app: [ok/…]
Fase 3: ejecutada [fecha/hora] · errores: [ninguno/…] · 4 índices con la definición esperada [sí/no] · explain usa los índices: [sí/cuáles no]
Fase 4/5: [no se hizo / qué se quitó o ajustó y con qué evidencia]
Rollback usado: [no / cuál fase y por qué]
```

## 10. Lo que NO se hace (a propósito)

- Checks de integridad nuevos en columnas de texto (`estado`, `region`, etc.): un check equivocado haría fallar altas legítimas y no se puede comprobar sin ver los datos reales.
- Índices en llaves foráneas hacia `usuarios`: solo importan si se borran usuarios, y la app no lo hace.
- Reorganizar `schema.sql` en "canónico + migraciones": cambia el archivo entero sin mejorar el rendimiento. Puede hacerse aparte.
- Cambiar parámetros globales de Postgres: dependen del plan de Supabase.
- Las pruebas locales usan datos sintéticos y no la distribución real de producción: por eso el `explain` de la §5 en producción es parte del plan.
