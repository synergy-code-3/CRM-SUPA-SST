-- Synergy CRM — esquema inicial para Supabase.
-- Correr una sola vez en el SQL Editor del dashboard (Database → SQL Editor → New query).

create extension if not exists pg_trgm;

create table if not exists clientes (
  id text primary key, -- correo normalizado (lowercase, trim)
  nombre text not null,
  email text not null,
  telefono text,
  pais text,
  ciudad text,
  notas text,
  fecha_inscripcion timestamptz,
  fin_acceso timestamptz,
  boletos_sin_informacion boolean not null default false,
  -- Fila del CSV de origen donde cayó por última vez este correo. Define el
  -- orden de la lista principal: la fila más alta = la más reciente.
  orden_csv bigint not null default 0,

  fecha_evento text,
  evento text,
  acceso_plataforma text,
  tipo_membresia text,
  vencimiento_skool text, -- texto libre tal como viene del CSV (D/M/YYYY)
  vencimiento_skool_fecha date, -- misma fecha, parseada, para filtrar/ordenar
  invitacion_skool text,
  contacto_whats text,
  llamada text,
  notas_soporte text,

  -- Región derivada del evento (tabla de inventario de boletos) o, si el
  -- evento no está catalogado, del país capturado a mano. Se recalcula en
  -- cada migración/reasignación de boletos.
  region text not null default 'LATAM' check (region in ('MX', 'US', 'LATAM')),

  accesos jsonb not null default '{
    "general": {"activo": false, "cantidad": 0, "variante": null},
    "vip": {"activo": false, "cantidad": 0, "variante": null},
    "black": {"activo": false, "cantidad": 0, "variante": null}
  }'::jsonb,

  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_clientes_orden_csv on clientes (orden_csv desc);
create index if not exists idx_clientes_evento on clientes (evento);
create index if not exists idx_clientes_tipo_membresia on clientes (tipo_membresia);
create index if not exists idx_clientes_acceso_plataforma on clientes (acceso_plataforma);
create index if not exists idx_clientes_region on clientes (region);
create index if not exists idx_clientes_fecha_inscripcion on clientes (fecha_inscripcion);
create index if not exists idx_clientes_vencimiento_skool_fecha on clientes (vencimiento_skool_fecha);
create index if not exists idx_clientes_nombre_trgm on clientes using gin (nombre gin_trgm_ops);
create index if not exists idx_clientes_email_trgm on clientes using gin (email gin_trgm_ops);

create table if not exists eventos_timeline (
  -- text, no uuid: los eventos de la importación masiva usan ids propios
  -- ("import-correo@..."), los generados por la app sí son UUID v4 pero se
  -- guardan igual como texto.
  id text primary key default gen_random_uuid()::text,
  cliente_id text not null references clientes (id) on delete cascade,
  tipo text not null,
  detalle text,
  autor text not null,
  fecha timestamptz not null default now()
);

create index if not exists idx_eventos_cliente_id on eventos_timeline (cliente_id, fecha);
create index if not exists idx_eventos_fecha on eventos_timeline (fecha desc);
create index if not exists idx_eventos_tipo on eventos_timeline (tipo);

-- RLS activo sin policies: bloquea cualquier acceso vía la publishable key
-- (anon). Toda la app pasa por el servidor de Next.js usando la secret key,
-- que ignora RLS. Si más adelante agregas acceso directo desde el
-- navegador, tendrás que crear policies explícitas aquí.
alter table clientes enable row level security;
alter table eventos_timeline enable row level security;

-- Integración con Kajabi: id del contacto en Kajabi, para no tener que
-- rebuscarlo por correo en cada alta/otorgamiento de oferta.
alter table clientes add column if not exists kajabi_contact_id text;

-- Clasificación propia del CRM (independiente de los tags de Kajabi),
-- capturada opcionalmente al dar de alta un cliente desde el formulario.
alter table clientes add column if not exists etiqueta text;

-- Tags del cliente (distintos de "etiqueta"): clasificación libre que se
-- asigna después, desde el panel del cliente — no en el alta. Un cliente
-- puede tener varios.
alter table clientes add column if not exists tags jsonb not null default '[]'::jsonb;

-- Catálogos administrables desde "Biblioteca" (menú lateral): las listas de
-- Eventos, Etiquetas y Tags que alimentan los desplegables con buscador de
-- toda la app. Cualquiera puede agregar opciones nuevas ahí sin tocar código.
create table if not exists catalogo_opciones (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('evento', 'etiqueta', 'tag')),
  valor text not null,
  creado_en timestamptz not null default now(),
  unique (tipo, valor)
);
alter table catalogo_opciones enable row level security;

insert into catalogo_opciones (tipo, valor) values
  ('evento', 'BOOTCAMP'),
  ('evento', 'WMDL-MX'),
  ('evento', 'WJS-MX'),
  ('evento', 'USA-WMDL'),
  ('evento', 'USA-WJS'),
  ('evento', 'EPUS - DALLAS'),
  ('evento', 'EPUS - AUSTIN'),
  ('evento', 'EPUS - SAN ANTONIO'),
  ('evento', 'EPUS - HOUSTON'),
  ('evento', 'EPUS - TAMPA'),
  ('evento', 'EPUS - ORLANDO'),
  ('evento', 'EPUS - MIAMI'),
  ('evento', 'EPUS - NEWARK'),
  ('evento', 'EPUS - CHICAGO'),
  ('evento', 'EPUS - BOSTON'),
  ('evento', 'EPUS - PHILADELPHIA'),
  ('evento', 'EPUS - SAN JOSE'),
  ('evento', 'EPUS - L.A.'),
  ('evento', 'EPUS - SAN DIEGO'),
  ('evento', 'EPUS - PHOENIX'),
  ('evento', 'EPUS - ATLANTA'),
  ('evento', 'EPUS - LAS VEGAS'),
  ('evento', 'EPUS - SACRAMENTO'),
  ('evento', 'EPUS - SAN FRANCISCO'),
  ('evento', 'EPUS - WASHINGTON'),
  ('evento', 'EPMX - GDL'),
  ('evento', 'EPMX - CDMX'),
  ('evento', 'EPMX - QRO'),
  ('evento', 'EPMX - MTY'),
  ('evento', 'EPMX - LEON'),
  ('evento', 'EPMX - PUEBLA'),
  ('evento', 'EPMX - AGS'),
  ('evento', 'EPMX - TOLUCA'),
  ('evento', 'EPMX - MORELIA'),
  ('evento', 'Equipo Sinergéticos'),
  ('evento', 'BGI'),
  ('evento', 'COL-WJS'),
  ('evento', 'PERU-WJS'),
  ('evento', 'EXTERNO'),
  ('evento', 'SYNERGY'),
  ('evento', 'SIN EVENTO-MX'),
  ('evento', 'SIN EVENTO-USA'),
  ('evento', 'COMITE'),
  ('evento', 'PLAN CORP. WEBINAR'),
  ('evento', 'EPUS - DENVER'),
  ('evento', 'EPUS - FRESNO'),
  ('evento', 'EPPERU - LIMA'),
  ('evento', 'EPCOL - MEDELLIN'),
  ('evento', 'EPCOL - BOGOTA'),
  ('evento', 'EPUS - SALT LAKE'),
  ('evento', 'EPUS - ALBUQUERQUE'),
  ('evento', 'EPUS - SEATTLE'),
  ('evento', 'LATAM SUR-JS'),
  ('evento', 'LATAM CENTRO-JS'),
  ('evento', 'EPUS - PORTLAND'),
  ('evento', 'EPUS - JACKSONVILLE'),
  ('evento', 'EPUS - WEST PALM'),
  ('evento', 'EPUS - BALTIMORE'),
  ('evento', 'EPMX - CHIHUAHUA'),
  ('evento', 'WJS- EUR'),
  ('evento', 'EPMX - SLP'),
  ('evento', 'EPMX - VTA'),
  ('evento', 'EPMX - PACH'),
  ('evento', 'EPMX - HMO'),
  ('evento', 'EPUS - CHARLOTTE'),
  ('evento', 'EPCA - TORONTO'),
  ('evento', 'EPMX - JUAREZ'),
  ('evento', 'EPMX-CHIHUAHUA'),
  ('evento', 'EPMX-TIJUANA'),
  ('evento', 'EPMX-MERIDA'),
  ('evento', 'EPMX-CANCUN'),
  ('evento', 'EPCA - VANCOUVER'),
  ('evento', 'EPUSA-REPUBLICA DOMINICANA'),
  ('evento', 'EPMX-REY'),
  ('evento', 'VIP-SU'),
  ('evento', 'GRAL-SU'),
  ('evento', 'EPMX-MXL'),
  ('etiqueta', 'BLACK ACCESS'),
  ('etiqueta', 'MÁS+'),
  ('etiqueta', 'Renovacion'),
  ('etiqueta', 'Equipo Sinergéticos'),
  ('etiqueta', 'BGI'),
  ('etiqueta', 'REVOCADO'),
  ('etiqueta', 'BECA'),
  ('etiqueta', 'MÁS+ USA'),
  ('etiqueta', 'MBA'),
  ('etiqueta', 'LegendarIA MX'),
  ('etiqueta', 'LegendarIA US'),
  ('etiqueta', 'LegendarIA LATAM')
on conflict (tipo, valor) do nothing;

-- Cursor de la sincronización periódica con Kajabi (reemplaza al webhook
-- nativo, sin permiso disponible para esta cuenta): guarda hasta qué
-- momento ya se revisó, para no reprocesar clientes en cada corrida ni,
-- sobre todo, reprocesar el historial completo la primera vez que corre.
create table if not exists kajabi_sync_estado (
  clave text primary key,
  valor text,
  actualizado_en timestamptz not null default now()
);
alter table kajabi_sync_estado enable row level security;

-- Archivado (no borrado real): al "eliminar" un cliente desde el CRM se
-- borra de verdad en Kajabi, pero aquí solo se marca con la fecha — sale de
-- la lista principal pero conserva su fila y su timeline completa para
-- poder auditar quién lo eliminó y cuándo.
alter table clientes add column if not exists eliminado_en timestamptz;
create index if not exists idx_clientes_eliminado_en on clientes (eliminado_en);

-- Autenticación propia del CRM (no Supabase Auth): usuarios internos con
-- contraseña propia (bcrypt) y rol fijo (admin/coordinador/abeja). El
-- login/JWT se maneja en la app (src/lib/auth.ts) — esta tabla es la única
-- fuente de verdad de credenciales y permisos.
create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  email text not null unique, -- normalizado (lowercase/trim) por la app, igual que clientes.id
  nombre text not null, -- se usa como "autor" en eventos_timeline
  password_hash text not null,
  rol text not null check (rol in ('admin', 'coordinador', 'abeja')),
  activo boolean not null default true,
  -- Se incrementa en cada cambio de rol/activo/password: invalida de
  -- inmediato cualquier sesión (JWT) ya emitida para este usuario.
  token_version integer not null default 1,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  ultimo_login timestamptz
);
alter table usuarios enable row level security;

-- Pausa de membresía: revoca el acceso en Kajabi de inmediato pero "congela"
-- los días que le quedaban, para que al reanudar no se le regale un año
-- completo de nuevo. fin_acceso_al_pausar es una foto de fin_acceso tomada
-- justo al pausar — de ahí se calculan los días restantes al reanudar.
alter table clientes add column if not exists pausado_en timestamptz;
alter table clientes add column if not exists fin_acceso_al_pausar timestamptz;

-- Teléfonos de compradores de Hotmart en espera: Kajabi le otorga la oferta
-- automático (vía su propia integración con Hotmart) sin pasar el teléfono,
-- y el sincronizador de Kajabi (cada ~15 min) suele crear al cliente
-- DESPUÉS de que ya llegó el webhook de Hotmart con el teléfono real. Se
-- guarda aquí hasta que el cliente exista, y ese sincronizador lo recoge.
create table if not exists hotmart_pendientes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  telefono text not null,
  producto text,
  recibido_en timestamptz not null default now()
);
create index if not exists idx_hotmart_pendientes_email on hotmart_pendientes (email);
alter table hotmart_pendientes enable row level security;

-- Migración desde la forma vieja (email como primary key, una sola fila por
-- correo): se dejaba pisar una compra pendiente por otra si llegaban dos
-- antes de que el cliente existiera (ej. compra el paquete chico y luego el
-- upgrade el mismo día). Idempotente — no hace nada si ya se corrió antes.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'hotmart_pendientes' and column_name = 'id'
  ) then
    alter table hotmart_pendientes add column id uuid not null default gen_random_uuid();
    alter table hotmart_pendientes drop constraint hotmart_pendientes_pkey;
    alter table hotmart_pendientes add primary key (id);
  end if;
end $$;

-- Solicitudes de alta de cliente: los vendedores (admin/coordinador/abeja)
-- ya no mandan los datos del cliente por WhatsApp, los llenan aquí junto con
-- el comprobante de pago. Queda "pendiente" hasta que un admin la revisa y
-- aprueba (ahí sí se crea el cliente de verdad, con sus efectos en
-- Kajabi/Skool/GHL) o la rechaza.
create table if not exists solicitudes_cliente (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  correo_pago text not null,
  correo_acceso text not null,
  telefono text not null,
  pais text,
  evento text not null,
  tipo_membresia text not null,
  -- Rutas dentro del bucket privado "comprobantes-pago" (Supabase Storage),
  -- no URLs públicas — se firman al vuelo para mostrarlas.
  comprobantes text[] not null default '{}',
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  solicitado_por_id uuid not null references usuarios (id),
  solicitado_por_nombre text not null,
  nota_revision text,
  revisado_por text,
  revisado_en timestamptz,
  cliente_id text references clientes (id),
  creado_en timestamptz not null default now()
);
create index if not exists idx_solicitudes_estado on solicitudes_cliente (estado, creado_en desc);
create index if not exists idx_solicitudes_solicitado_por on solicitudes_cliente (solicitado_por_id);
alter table solicitudes_cliente enable row level security;

-- "Otras Ofertas": roster independiente de clientes (Club Sinergético). Un
-- registro por persona (correo normalizado como id) — mismo criterio que
-- clientes.id, pero en su propio espacio: la misma persona puede existir en
-- ambas tablas como registros no relacionados, a propósito (no se mezclan
-- las listas del Club y de otras ofertas).
create table if not exists otras_ofertas_clientes (
  id text primary key, -- correo normalizado (lowercase, trim)
  nombre text not null,
  email text not null,
  telefono text,
  tags jsonb not null default '[]'::jsonb,
  etiqueta text,
  orden_csv bigint not null default 0,
  kajabi_contact_id text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_otras_ofertas_clientes_orden_csv on otras_ofertas_clientes (orden_csv desc);
create index if not exists idx_otras_ofertas_clientes_nombre_trgm on otras_ofertas_clientes using gin (nombre gin_trgm_ops);
create index if not exists idx_otras_ofertas_clientes_email_trgm on otras_ofertas_clientes using gin (email gin_trgm_ops);
alter table otras_ofertas_clientes enable row level security;

-- Historial de ofertas otorgadas a un registro de otras_ofertas_clientes,
-- fechado. Reimportar a la misma persona con otra oferta NUNCA pisa una fila
-- anterior — siempre agrega una nueva, para saber cuándo se otorgó cada una.
create table if not exists otras_ofertas_otorgadas (
  id uuid primary key default gen_random_uuid(),
  cliente_id text not null references otras_ofertas_clientes (id) on delete cascade,
  oferta_id text not null,
  oferta_titulo text not null,
  fecha_otorgada timestamptz not null default now(),
  fin_acceso timestamptz not null, -- fecha_otorgada + 365 días
  otorgado_por text not null,
  revocado_en timestamptz, -- null = sigue activa; se puede revocar desde el detalle del cliente
  revocado_por text
);
create index if not exists idx_otras_ofertas_otorgadas_cliente_id on otras_ofertas_otorgadas (cliente_id, fecha_otorgada desc);
alter table otras_ofertas_otorgadas enable row level security;

-- Ofertas EXTRA (no la del Club) otorgadas a un cliente del Club Sinergético
-- ya existente, desde su panel o su alta. FK a `clientes`, no a
-- otras_ofertas_clientes — son dos rosters completamente distintos.
create table if not exists clientes_ofertas (
  id uuid primary key default gen_random_uuid(),
  cliente_id text not null references clientes (id) on delete cascade,
  oferta_id text not null,
  oferta_titulo text not null,
  fecha_otorgada timestamptz not null default now(),
  fin_acceso timestamptz not null,
  otorgado_por text not null,
  revocado_en timestamptz, -- null = sigue activa; se puede revocar desde el panel del cliente
  revocado_por text
);
create index if not exists idx_clientes_ofertas_cliente_id on clientes_ofertas (cliente_id, fecha_otorgada desc);
alter table clientes_ofertas enable row level security;

-- Perfil de usuario autogestionado: teléfono(s) y foto se piden al iniciar
-- sesión si faltan (ver Sidebar.tsx / MiPerfilModal.tsx), tanto para
-- usuarios nuevos (autoregistro) como para los ya existentes. Array, no un
-- solo texto: cada quien puede agregar más de un teléfono a su perfil.
alter table usuarios add column if not exists telefonos text[] not null default '{}';
alter table usuarios add column if not exists foto_url text;

-- Se marca la primera vez que un admin activa la cuenta (activo pasa a
-- true) y ya no se toca después. Con el autoregistro dejando entrar al
-- usuario para ver la pantalla de "acceso pendiente" (ya no se le niega el
-- login mientras espera aprobación), "nunca inició sesión" deja de servir
-- para distinguir un autoregistro recién llegado de una cuenta que un
-- admin desactivó después de haberla aprobado alguna vez — esta columna sí
-- se queda fija para siempre y no depende de si ya inició sesión.
alter table usuarios add column if not exists primera_aprobacion_en timestamptz;

-- "Fin de acceso" deja de ser un dato guardado aparte (clientes.fin_acceso
-- queda como columna legado, ya no se lee ni se escribe): a partir de
-- ahora se calcula siempre como (fecha_renovacion si existe, si no
-- fecha_inscripcion) + 1 año — ver finAccesoCalculado() en
-- src/lib/fechas.ts. fecha_renovacion la pone el botón "Renovar" de este
-- CRM (o se corrige a mano en el perfil), sin tocar fecha_inscripcion —
-- son dos fechas separadas a propósito.
alter table clientes add column if not exists fecha_renovacion timestamptz;

-- "accesos" pasa de un objeto único por categoría a una LISTA por categoría
-- (general/vip/black), porque algunos eventos reales dan boletos en MX y en
-- US a la vez al mismo cliente — con un solo detalle por categoría se
-- perdía uno de los dos. Las filas ya guardadas con la forma vieja se leen
-- bien igual (normalizarAccesos() en src/lib/supabase-map.ts las sube sola
-- al leer), no hace falta migrarlas todas de golpe — pero si se quiere
-- limpio desde ya, correr `npm run asignar-boletos` las reescribe.
alter table clientes alter column accesos set default '{"general": [], "vip": [], "black": []}'::jsonb;

-- Cuando un admin corrige los accesos a mano ("Editar accesos"), esta
-- columna queda en true — mientras esté así, ningún recálculo automático
-- (recalcularAccesos, ni el job masivo `npm run asignar-boletos`) vuelve a
-- tocar los boletos de ese cliente. Se libera con el botón "Volver a
-- calcular automático" del panel.
alter table clientes add column if not exists accesos_editado_manual boolean not null default false;

-- Id del "lead" en el CRM de VSL (equipo de Soporte) que originó esta
-- solicitud, cuando se creó sola por la sincronización automática (no a
-- mano por un vendedor) — ver src/lib/sincronizar-vsl.ts. Único: evita
-- crear una solicitud duplicada del mismo lead en cada corrida del cron.
-- NULL para toda solicitud llenada normal por el formulario.
alter table solicitudes_cliente add column if not exists lead_id_vsl text unique;

-- Etiqueta opcional (mismo catálogo que clientes.etiqueta) — para casos como
-- "MÁS+"/"BLACK ACCESS" que ya no van en evento (ver calcularAccesos en
-- boletos.ts): se le suman a los accesos que le tocan por evento, no los
-- reemplazan. Se copia al cliente real al aprobar la solicitud.
alter table solicitudes_cliente add column if not exists etiqueta text;
