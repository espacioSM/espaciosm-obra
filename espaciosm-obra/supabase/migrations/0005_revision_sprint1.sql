-- =============================================================================
-- espacioSM Obra · Sprint 1 · Ajustes de la revisión
-- Archivo: supabase/migrations/0005_revision_sprint1.sql
--
-- Ejecutar después de 0004. Cierra tres detalles:
--   1. El historial de asistencia es inmutable también a nivel de privilegios
--      y solo lo consulta administración.
--   2. registrado_por siempre es quien hace la operación, también para la
--      oficina que corrige días anteriores.
--   3. Una cuenta inactiva tampoco ve sus propias filas de proyecto_miembros.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Historial: solo lectura, solo administración
-- -----------------------------------------------------------------------------

revoke all on public.asistencia_historial from public, anon, authenticated;
grant select on public.asistencia_historial to authenticated;

drop policy if exists asistencia_historial_select on public.asistencia_historial;

create policy asistencia_historial_select on public.asistencia_historial
for select to authenticated
using (public.es_admin());

-- -----------------------------------------------------------------------------
-- 2. Autor de la asistencia
-- -----------------------------------------------------------------------------

create or replace function public.sellar_asistencia()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_gestor boolean;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_ahora time := (now() at time zone 'America/Mexico_City')::time;
begin
  if auth.uid() is null then
    return new;
  end if;

  v_gestor := public.rol_actual() in ('admin', 'permiso_medio');

  if tg_op = 'INSERT' then
    if not v_gestor then
      new.fecha := v_hoy;
      new.hora_entrada := v_ahora;
      new.hora_salida := null;
    end if;
  else
    if not v_gestor then
      if new.empleado_id is distinct from old.empleado_id
         or new.proyecto_id is distinct from old.proyecto_id
         or new.fecha is distinct from old.fecha then
        raise exception 'No puedes cambiar el empleado, la obra ni la fecha del registro'
          using errcode = '42501';
      end if;

      if new.hora_entrada is distinct from old.hora_entrada then
        raise exception 'La hora de entrada no se modifica'
          using errcode = '42501';
      end if;

      if old.hora_salida is not null
         and new.hora_salida is distinct from old.hora_salida then
        raise exception 'La jornada ya está cerrada'
          using errcode = '42501';
      end if;

      if new.hora_salida is not null then
        new.hora_salida := v_ahora;
      end if;
    end if;
  end if;

  -- Vale para todos los roles: el autor es quien tiene la sesión.
  new.registrado_por := auth.uid();

  if new.fecha > v_hoy then
    raise exception 'La fecha de asistencia no puede ser futura'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Miembros de proyecto: la cuenta inactiva tampoco ve sus filas
-- -----------------------------------------------------------------------------

drop policy if exists proyecto_miembros_select on public.proyecto_miembros;

create policy proyecto_miembros_select on public.proyecto_miembros
for select to authenticated
using (
  public.rol_actual() is not null
  and (
    usuario_id = auth.uid()
    or public.es_admin()
    or public.tiene_acceso_proyecto(proyecto_id)
  )
);
