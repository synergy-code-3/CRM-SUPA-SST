-- Índices para buscar las hojas confirmadas de un cliente (perfil del cliente > Seguimiento y soporte) por correo o teléfono.
-- Idempotente: se puede correr varias veces en el SQL Editor de Supabase.
create index if not exists idx_cap_hojas_cliente_correo on cap_hojas ((campos ->> 'correo'))
  where estado = 'confirmada';
create index if not exists idx_cap_hojas_cliente_telefono on cap_hojas ((campos ->> 'telefono'))
  where estado = 'confirmada';
analyze cap_hojas;
