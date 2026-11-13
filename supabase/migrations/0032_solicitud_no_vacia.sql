-- =============================================================================
-- espacioSM Obra · Bloquear solicitudes de estimación vacías
-- Archivo: supabase/migrations/0032_solicitud_no_vacia.sql
--
-- Ejecutar después de 0031.
--
-- Si no hay avances disponibles para las partidas seleccionadas, no se crea
-- la estimación. También elimina las solicitudes vacías generadas antes.
-- =============================================================================

create or replace function public.solicitar_estimacion(
  p_proyecto_id uuid,
  p_numero text,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_retencion numeric,
  p_notas text,
  p_generador_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estimacion uuid;
  v_generador record;
  v_propios numeric(12, 2);
  v_todos numeric(12, 2);
  v_estimado numeric(12, 2);
  v_cantidad numeric(12, 2);
  v_base text;
  v_numero text;
  v_secuencia integer := 1;
  v_partidas integer := 0;
begin
  if public.rol_actual() <> 'residente'
     or not public.puede('estimaciones', 'crear')
     or not public.tiene_acceso_proyecto(p_proyecto_id) then
    raise exception 'Sin permiso para solicitar estimaciones'
      using errcode = '42501';
  end if;

  if p_fecha_fin < p_fecha_inicio then
    raise exception 'La fecha final debe ser posterior a la inicial'
      using errcode = '23514';
  end if;

  if p_retencion < 0 or p_retencion > 100 then
    raise exception 'La retención debe estar entre 0 y 100'
      using errcode = '23514';
  end if;

  if coalesce(array_length(p_generador_ids, 1), 0) = 0 then
    raise exception 'Selecciona al menos una partida para solicitar la estimación'
      using errcode = '23514';
  end if;

  v_base := 'SOL-' || to_char(
    (now() at time zone 'America/Mexico_City')::date,
    'YYYYMMDD'
  );
  v_numero := v_base;

  while exists (
    select 1
    from public.estimaciones e
    where e.proyecto_id = p_proyecto_id
      and e.numero = v_numero
  ) loop
    v_secuencia := v_secuencia + 1;
    v_numero := v_base || '-' || lpad(v_secuencia::text, 2, '0');
  end loop;

  insert into public.estimaciones
    (proyecto_id, numero, fecha_inicio, fecha_fin, retencion_porcentaje,
     notas, estado, solicitado_por)
  values
    (p_proyecto_id, v_numero, p_fecha_inicio, p_fecha_fin, p_retencion,
     p_notas, 'enviada', auth.uid())
  returning id into v_estimacion;

  for v_generador in
    select distinct g.id, g.clave, g.descripcion, g.unidad, g.precio_unitario
    from public.generadores g
    join unnest(p_generador_ids) as sel(id) on sel.id = g.id
    where g.proyecto_id = p_proyecto_id
      and g.activo
  loop
    select coalesce(sum(a.cantidad), 0)
      into v_propios
    from public.generador_avances a
    where a.generador_id = v_generador.id
      and a.fecha >= p_fecha_inicio
      and a.fecha <= p_fecha_fin
      and a.estado = 'validado'
      and a.registrado_por = auth.uid();

    select coalesce(sum(a.cantidad), 0)
      into v_todos
    from public.generador_avances a
    where a.generador_id = v_generador.id
      and a.fecha >= p_fecha_inicio
      and a.fecha <= p_fecha_fin
      and a.estado = 'validado';

    select coalesce(sum(ep.cantidad), 0)
      into v_estimado
    from public.estimacion_partidas ep
    join public.estimaciones e on e.id = ep.estimacion_id
    where ep.generador_id = v_generador.id
      and e.proyecto_id = p_proyecto_id;

    v_cantidad := least(v_propios, greatest(v_todos - v_estimado, 0));

    if v_cantidad > 0.005 then
      insert into public.estimacion_partidas
        (estimacion_id, generador_id, clave, descripcion, unidad, cantidad, precio_unitario)
      values
        (
          v_estimacion,
          v_generador.id,
          v_generador.clave,
          v_generador.descripcion,
          v_generador.unidad,
          round(v_cantidad, 2),
          v_generador.precio_unitario
        );

      v_partidas := v_partidas + 1;
    end if;
  end loop;

  if v_partidas = 0 then
    delete from public.estimaciones where id = v_estimacion;
    raise exception 'No hay avances disponibles para las partidas seleccionadas'
      using errcode = '23514';
  end if;

  return v_estimacion;
end;
$$;

revoke all on function public.solicitar_estimacion(
  uuid, text, date, date, numeric, text, uuid[]
) from public, anon;
grant execute on function public.solicitar_estimacion(
  uuid, text, date, date, numeric, text, uuid[]
) to authenticated;

-- Limpia solicitudes vacías creadas por la versión anterior.
delete from public.estimaciones e
where e.numero like 'SOL-%'
  and not exists (
    select 1
    from public.estimacion_partidas ep
    where ep.estimacion_id = e.id
  );

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as estimaciones from public.estimaciones;
