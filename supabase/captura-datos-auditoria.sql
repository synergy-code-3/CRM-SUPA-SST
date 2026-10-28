-- Captura de Datos: historial de movimientos importantes (solo lo ve un admin). Idempotente; correr a mano en el
-- SQL Editor de Supabase. Si no existe, la app sigue funcionando (el historial se omite y el error queda en los
-- logs del servidor), pero no se guardará nada.
--
-- NO lleva llaves foráneas a propósito: el rastro debe sobrevivir al borrado del evento, de la hoja o del usuario
-- (por eso guarda también sus nombres). Se purga solo con un cron semanal (RETENCION_AUDITORIA_DIAS).
create table if not exists cap_auditoria (
  id bigserial primary key,
  en timestamptz not null default now(),
  usuario_id uuid,
  usuario_nombre text,
  evento_id uuid,
  evento_nombre text,
  hoja_id uuid,
  accion text not null,
  detalle jsonb
);
create index if not exists idx_cap_auditoria_evento on cap_auditoria (evento_id, id desc);
create index if not exists idx_cap_auditoria_en on cap_auditoria (en);
alter table cap_auditoria enable row level security;
