-- =============================================================================
-- espacioSM Obra · Avances por tramo y validación
-- Archivo: supabase/migrations/0017_avances_tramo.sql
--
-- Ejecutar después de 0016.
--
-- Agrega ubicación estructurada, dimensiones y estatus al avance del generador.
-- El residente captura y envía; administración o permiso medio valida o rechaza.
-- Solo los avances validados entran a estimación.
-- =============================================================================

do $$
begin
  create type public.estado_avance_generador as enum (
    'borrador', 'enviado', 'validado', 'rechazado'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.generador_avances
  add column if not exists nivel text;

alter table public.generador_avances
  add column if not exists eje text;

alter table public.generador_avances
  add column if not exists tramo text;

alter table public.generador_avances
  add column if not exists frente text;

alter table public.generador_avances
  add column if not exists largo numeric(12, 3);

alter table public.generador_avances
  add column if not exists ancho numeric(12, 3);

alter table public.generador_avances
  add column if not exists alto numeric(12, 3);

alter table public.generador_avances
  add column if not exists piezas numeric(12, 3) default 1;

alter table public.generador_avances
  add column if not exists estado public.estado_avance_generador
  not null default 'borrador';

alter table public.generador_avances
  add column if not exists validado_por uuid references public.perfiles (id);

alter table public.generador_avances
  add column if not exists validado_en timestamptz;

alter table public.generador_avances
  add column if not exists observaciones text;

-- Los avances que ya existían se consideran validados para no romper cálculos.
update public.generador_avances
set estado = 'validado'
where estado = 'borrador';

alter table public.generador_avances
  drop constraint if exists generador_avances_dimensiones_no_negativas;

alter table public.generador_avances
  add constraint generador_avances_dimensiones_no_negativas
  check (
    (largo is null or largo >= 0)
    and (ancho is null or ancho >= 0)
    and (alto is null or alto >= 0)
    and (piezas is null or piezas >= 0)
  );

create index if not exists generador_avances_estado_idx
  on public.generador_avances (proyecto_id, estado, fecha desc);

-- El residente captura avances; los conceptos siguen siendo de oficina.
update public.rol_permisos
set permitido = true
where rol = 'residente'
  and modulo = 'generadores'
  and accion in ('ver', 'crear', 'editar');

drop policy if exists generadores_insert on public.generadores;
create policy generadores_insert on public.generadores
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('generadores', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists generadores_update on public.generadores;
create policy generadores_update on public.generadores
for update to authenticated
using (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('generadores', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
)
with check (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('generadores', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists generador_avances_insert on public.generador_avances;
create policy generador_avances_insert on public.generador_avances
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.puede('generadores', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
    and registrado_por = auth.uid()
    and (
      public.rol_actual() <> 'residente'
      or estado in ('borrador', 'enviado')
    )
  )
);

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
    and registrado_por = auth.uid()
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
    and registrado_por = auth.uid()
    and estado in ('borrador', 'rechazado', 'enviado')
  )
);

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

  if auth.uid() is not null then
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

-- Solo avances validados entran a la estimación.
create or replace function public.crear_estimacion(
  p_proyecto_id uuid,
  p_numero text,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_retencion numeric,
  p_notas text
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
  if not public.es_admin() then
    raise exception 'Solo administración puede crear estimaciones'
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

  if not exists (
    select 1 from public.proyectos where id = p_proyecto_id
  ) then
    raise exception 'La obra no existe' using errcode = '23503';
  end if;

  insert into public.estimaciones
    (proyecto_id, numero, fecha_inicio, fecha_fin, retencion_porcentaje, notas)
  values
    (p_proyecto_id, btrim(p_numero), p_fecha_inicio, p_fecha_fin, p_retencion, p_notas)
  returning id into v_estimacion;

  for v_generador in
    select g.id, g.clave, g.descripcion, g.unidad, g.precio_unitario
    from public.generadores g
    where g.proyecto_id = p_proyecto_id
      and g.activo
  loop
    select coalesce(sum(a.cantidad), 0)
      into v_avances
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

revoke all on function public.crear_estimacion(uuid, text, date, date, numeric, text)
  from public, anon;
grant execute on function public.crear_estimacion(uuid, text, date, date, numeric, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select
  (select count(*) from public.generador_avances where estado = 'validado') as validados,
  (select count(*) from public.generador_avances where estado = 'enviado') as enviados;
