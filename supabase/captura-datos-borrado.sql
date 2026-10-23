-- Solicitudes para borrar un evento de Captura de Datos: un admin pide el borrado con un motivo y solo
-- Samuel Otniel Diaz Gonzalez puede aprobarlo (se borra) o rechazarlo (no se borra). Idempotente.
-- evento_id NO es llave foránea: la solicitud queda como registro aunque el evento ya se haya borrado.
create table if not exists cap_solicitudes_borrado (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null,
  evento_nombre text not null,
  motivo text not null,
  solicitada_por uuid not null references usuarios (id),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  resuelta_por uuid references usuarios (id),
  creada_en timestamptz not null default now(),
  resuelta_en timestamptz
);
create unique index if not exists cap_solicitudes_borrado_una_pendiente on cap_solicitudes_borrado (evento_id) where estado = 'pendiente';
alter table cap_solicitudes_borrado enable row level security;

-- Borrar un evento que alguna vez se reabrió fallaba por la FK de reaperturas (sin ON DELETE); sin esto la aprobación fallaría.
alter table cap_eventos_reaperturas drop constraint if exists cap_eventos_reaperturas_evento_id_fkey;
alter table cap_eventos_reaperturas
  add constraint cap_eventos_reaperturas_evento_id_fkey foreign key (evento_id) references cap_eventos (id) on delete cascade;
