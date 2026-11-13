-- =============================================================================
-- espacioSM Obra · Corrección de avances rechazados
-- Archivo: supabase/actualizacion_0018_0019.sql
--
-- Ejecutar una vez en el proyecto actual. Incluye 0018 y 0019.
-- =============================================================================

-- ############################################################################
-- INICIO 0018_respuesta_avance.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Respuesta del residente a un avance rechazado
-- Archivo: supabase/migrations/0018_respuesta_avance.sql
--
-- Ejecutar después de 0017.
--
-- Guarda la respuesta del residente cuando corrige y reenvía un avance que
-- administración o permiso medio rechazaron.
-- =============================================================================

alter table public.generador_avances
  add column if not exists respuesta_residente text;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as avances from public.generador_avances;

-- ############################################################################
-- INICIO 0019_corregir_rechazado.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Conservar autor y permitir corregir avances rechazados
-- Archivo: supabase/migrations/0019_corregir_rechazado.sql
--
-- Ejecutar después de 0018.
--
--   1. El autor original del avance ya no se sobrescribe al validar o rechazar.
--   2. Un residente de la obra puede corregir un avance rechazado y reenviarlo.
-- =============================================================================

create or replace function public.fijar_generador_avance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proyecto uuid;
  v_cantidad numeric(12, 2);
  v_ejecutado numeric(12, 2);
begin
  if tg_op = 'UPDATE' and old.estado = 'validado' then
    raise exception 'El avance ya está validado y no se puede modificar'
      using errcode = '42501';
  end if;

  select g.proyecto_id, g.cantidad
    into v_proyecto, v_cantidad
  from public.generadores g
  where g.id = new.generador_id;

  if v_proyecto is null then
    raise exception 'El generador no existe' using errcode = '23503';
  end if;

  select coalesce(sum(a.cantidad), 0)
    into v_ejecutado
  from public.generador_avances a
  where a.generador_id = new.generador_id
    and a.id <> new.id
    and a.estado in ('enviado', 'validado');

  if v_ejecutado + new.cantidad > v_cantidad + 0.005 then
    raise exception 'El avance excede la cantidad contratada del generador'
      using errcode = '23514';
  end if;

  new.proyecto_id := v_proyecto;

  if tg_op = 'INSERT' and auth.uid() is not null then
    new.registrado_por := auth.uid();
  end if;

  if new.estado = 'validado' and (tg_op = 'INSERT' or old.estado <> 'validado') then
    new.validado_por := auth.uid();
    new.validado_en := now();
  end if;

  if new.estado = 'rechazado' and (tg_op = 'INSERT' or old.estado <> 'rechazado') then
    new.validado_por := auth.uid();
    new.validado_en := now();
  end if;

  return new;
end;
$$;

drop policy if exists generador_avances_update on public.generador_avances;
create policy generador_avances_update on public.generador_avances
for update to authenticated
using (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('generadores', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
  or (
    public.rol_actual() = 'residente'
    and public.puede('generadores', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
    and estado in ('borrador', 'rechazado')
  )
)
with check (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('generadores', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
  or (
    public.rol_actual() = 'residente'
    and public.puede('generadores', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
    and estado in ('borrador', 'rechazado', 'enviado')
  )
);

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as avances from public.generador_avances;
