-- =============================================================================
-- espacioSM Obra · Solicitud de estimación por el residente
-- Archivo: supabase/migrations/0028_solicitud_estimacion.sql
--
-- Ejecutar después de 0027.
--
-- El residente solicita una estimación con sus propios avances validados.
-- Administración la recibe como enviada, la autoriza y después pasa a pagos.
-- =============================================================================

alter table public.estimaciones
  add column if not exists solicitado_por uuid references public.perfiles (id)
  default auth.uid();

update public.estimaciones
set solicitado_por = creado_por
where solicitado_por is null;

update public.rol_permisos
set permitido = true
where rol = 'residente'
  and modulo = 'estimaciones'
  and accion in ('ver', 'crear');

drop policy if exists estimaciones_select on public.estimaciones;
create policy estimaciones_select on public.estimaciones
for select to authenticated
using (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('estimaciones', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
  or (
    public.rol_actual() = 'residente'
    and public.puede('estimaciones', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
    and solicitado_por = auth.uid()
  )
);

drop policy if exists estimaciones_insert on public.estimaciones;
create policy estimaciones_insert on public.estimaciones
for insert to authenticated
with check (public.es_admin());

drop policy if exists estimacion_partidas_select on public.estimacion_partidas;
create policy estimacion_partidas_select on public.estimacion_partidas
for select to authenticated
using (
  public.es_admin()
  or exists (
    select 1
    from public.estimaciones e
    where e.id = estimacion_id
      and public.rol_actual() = 'permiso_medio'
      and public.puede('estimaciones', 'ver')
      and public.tiene_acceso_proyecto(e.proyecto_id)
  )
  or exists (
    select 1
    from public.estimaciones e
    where e.id = estimacion_id
      and public.rol_actual() = 'residente'
      and public.puede('estimaciones', 'ver')
      and public.tiene_acceso_proyecto(e.proyecto_id)
      and e.solicitado_por = auth.uid()
  )
);

create or replace function public.previsualizar_solicitud_estimacion(
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
  importe numeric
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
      ) as importe
    from public.generadores g
    left join (
      select av.generador_id, sum(av.cantidad) as cantidad
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
  v_avances numeric(12, 2);
  v_estimado numeric(12, 2);
  v_cantidad numeric(12, 2);
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

  insert into public.estimaciones
    (proyecto_id, numero, fecha_inicio, fecha_fin, retencion_porcentaje,
     notas, estado, solicitado_por)
  values
    (p_proyecto_id, btrim(p_numero), p_fecha_inicio, p_fecha_fin, p_retencion,
     p_notas, 'enviada', auth.uid())
  returning id into v_estimacion;

  for v_generador in
    select distinct g.id, g.clave, g.descripcion, g.unidad, g.precio_unitario
    from public.generadores g
    join unnest(coalesce(p_generador_ids, array[]::uuid[])) as sel(id)
      on sel.id = g.id
    where g.proyecto_id = p_proyecto_id
      and g.activo
  loop
    select coalesce(sum(a.cantidad), 0)
      into v_avances
    from public.generador_avances a
    where a.generador_id = v_generador.id
      and a.fecha >= p_fecha_inicio
      and a.fecha <= p_fecha_fin
      and a.estado = 'validado'
      and a.registrado_por = auth.uid();

    select coalesce(sum(ep.cantidad), 0)
      into v_estimado
    from public.estimacion_partidas ep
    join public.estimaciones e on e.id = ep.estimacion_id
    where ep.generador_id = v_generador.id
      and e.proyecto_id = p_proyecto_id;

    v_cantidad := v_avances - v_estimado;

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
    end if;
  end loop;

  return v_estimacion;
end;
$$;

revoke all on function public.previsualizar_solicitud_estimacion(uuid, date, date)
  from public, anon;
revoke all on function public.solicitar_estimacion(
  uuid, text, date, date, numeric, text, uuid[]
) from public, anon;

grant execute on function public.previsualizar_solicitud_estimacion(uuid, date, date)
  to authenticated;
grant execute on function public.solicitar_estimacion(
  uuid, text, date, date, numeric, text, uuid[]
) to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as estimaciones from public.estimaciones;
