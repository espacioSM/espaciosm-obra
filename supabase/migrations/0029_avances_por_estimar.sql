-- =============================================================================
-- espacioSM Obra · Avances aprobados listos para estimar
-- Archivo: supabase/migrations/0029_avances_por_estimar.sql
--
-- Ejecutar después de 0028.
--
-- La previsualización de la solicitud devuelve también las fechas de los
-- avances, para que el residente no tenga que buscar el periodo manualmente.
-- =============================================================================

drop function if exists public.previsualizar_solicitud_estimacion(uuid, date, date);

create function public.previsualizar_solicitud_estimacion(
  p_proyecto_id uuid,
  p_fecha_inicio date,
  p_fecha_fin date
)
returns table (
  generador_id uuid,
  clave text,
  descripcion text,
  unidad text,
  cantidad numeric,
  precio_unitario numeric,
  importe numeric,
  fecha_min date,
  fecha_max date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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

  return query
    select
      g.id,
      g.clave,
      g.descripcion,
      g.unidad,
      round(coalesce(a.cantidad, 0) - coalesce(e.cantidad, 0), 2) as cantidad,
      g.precio_unitario,
      round(
        (coalesce(a.cantidad, 0) - coalesce(e.cantidad, 0)) * g.precio_unitario,
        2
      ) as importe,
      a.fecha_min,
      a.fecha_max
    from public.generadores g
    left join (
      select
        av.generador_id,
        sum(av.cantidad) as cantidad,
        min(av.fecha) as fecha_min,
        max(av.fecha) as fecha_max
      from public.generador_avances av
      where av.fecha >= p_fecha_inicio
        and av.fecha <= p_fecha_fin
        and av.estado = 'validado'
        and av.registrado_por = auth.uid()
      group by av.generador_id
    ) a on a.generador_id = g.id
    left join (
      select ep.generador_id, sum(ep.cantidad) as cantidad
      from public.estimacion_partidas ep
      join public.estimaciones est on est.id = ep.estimacion_id
      where est.proyecto_id = p_proyecto_id
      group by ep.generador_id
    ) e on e.generador_id = g.id
    where g.proyecto_id = p_proyecto_id
      and g.activo
      and coalesce(a.cantidad, 0) - coalesce(e.cantidad, 0) > 0.005
    order by g.clave nulls last, g.descripcion;
end;
$$;

revoke all on function public.previsualizar_solicitud_estimacion(uuid, date, date)
  from public, anon;
grant execute on function public.previsualizar_solicitud_estimacion(uuid, date, date)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as avances from public.generador_avances where estado = 'validado';
