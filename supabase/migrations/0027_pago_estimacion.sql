-- =============================================================================
-- espacioSM Obra · Pago ligado a estimación
-- Archivo: supabase/migrations/0027_pago_estimacion.sql
--
-- Ejecutar después de 0026.
--
-- Permite registrar un pago contra una estimación autorizada y marca la
-- estimación como pagada en la misma operación.
-- =============================================================================

alter table public.pagos
  add column if not exists estimacion_id uuid references public.estimaciones (id)
  on delete set null;

create index if not exists pagos_estimacion_idx
  on public.pagos (estimacion_id);

create or replace function public.marcar_estimacion_pagada()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.estimacion_id is not null then
    update public.estimaciones
    set estado = 'pagada'
    where id = new.estimacion_id
      and estado = 'autorizada';
  end if;

  return new;
end;
$$;

drop trigger if exists pagos_estimacion_pagada on public.pagos;
create trigger pagos_estimacion_pagada
after insert or update of estimacion_id on public.pagos
for each row execute function public.marcar_estimacion_pagada();

revoke all on function public.marcar_estimacion_pagada() from public, anon;
grant execute on function public.marcar_estimacion_pagada() to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as pagos from public.pagos;
