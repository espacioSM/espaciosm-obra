-- =============================================================================
-- espacioSM Obra · Cuadrillas por concepto y actividad
-- Archivo: supabase/migrations/0036_cuadrillas_rendimiento.sql
--
-- Ejecutar después de 0035.
--
-- El rendimiento es por cuadrilla. La duración de la actividad se calcula:
-- cantidad / (rendimiento * cuadrillas).
-- =============================================================================

alter table public.generadores
  add column if not exists cuadrillas numeric(6, 2) not null default 1;

alter table public.programa_actividades
  add column if not exists cuadrillas numeric(6, 2) not null default 1;

do $$
begin
  alter table public.generadores
    add constraint generadores_cuadrillas_positivas check (cuadrillas > 0);
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.programa_actividades
    add constraint programa_cuadrillas_positivas check (cuadrillas > 0);
exception
  when duplicate_object then null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select
  (select count(*) from public.generadores) as generadores,
  (select count(*) from public.programa_actividades) as actividades;
