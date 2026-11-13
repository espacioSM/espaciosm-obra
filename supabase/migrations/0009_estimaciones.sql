-- =============================================================================
-- espacioSM Obra · Estimaciones
-- Archivo: supabase/migrations/0009_estimaciones.sql
--
-- Ejecutar después de 0008.
--
-- Una estimación es un corte por periodo. Al crearla, toma los avances de los
-- generadores dentro del periodo y descuenta lo ya estimado, para no duplicar
-- cantidades entre cortes.
-- =============================================================================

do $$
begin
  create type public.estado_estimacion as enum (
    'borrador', 'enviada', 'autorizada', 'pagada'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.estimaciones (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  numero text not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  retencion_porcentaje numeric(5, 2) not null default 0,
  estado public.estado_estimacion not null default 'borrador',
  notas text,
  creado_por uuid references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint estimaciones_numero_no_vacio check (btrim(numero) <> ''),
  constraint estimaciones_fechas_coherentes check (fecha_fin >= fecha_inicio),
  constraint estimaciones_retencion_valida
    check (retencion_porcentaje >= 0 and retencion_porcentaje <= 100),
  constraint estimaciones_proyecto_numero unique (proyecto_id, numero)
);

create index if not exists estimaciones_proyecto_fecha_idx
  on public.estimaciones (proyecto_id, fecha_fin desc);

create table if not exists public.estimacion_partidas (
  id uuid primary key default gen_random_uuid(),
  estimacion_id uuid not null references public.estimaciones (id) on delete cascade,
  generador_id uuid not null references public.generadores (id) on delete restrict,
  clave text,
  descripcion text not null,
  unidad text not null,
  cantidad numeric(12, 2) not null,
  precio_unitario numeric(12, 2) not null,
  importe numeric(14, 2) generated always as
    (round(cantidad * precio_unitario, 2)) stored,
  creado_en timestamptz not null default now(),
  constraint estimacion_partidas_cantidad_positiva check (cantidad > 0),
  constraint estimacion_partidas_precio_no_negativo check (precio_unitario >= 0),
  constraint estimacion_partidas_una_por_generador
    unique (estimacion_id, generador_id)
);

create index if not exists estimacion_partidas_estimacion_idx
  on public.estimacion_partidas (estimacion_id);

drop trigger if exists estimaciones_actualizado on public.estimaciones;
create trigger estimaciones_actualizado
before update on public.estimaciones
for each row execute function public.marcar_actualizado();

alter table public.estimaciones enable row level security;
alter table public.estimacion_partidas enable row level security;

revoke all on public.estimaciones from anon;
revoke all on public.estimacion_partidas from anon;
grant select, insert, update, delete on public.estimaciones to authenticated;
grant select on public.estimacion_partidas to authenticated;
revoke insert, update, delete on public.estimacion_partidas from authenticated;

drop policy if exists estimaciones_select on public.estimaciones;
create policy estimaciones_select on public.estimaciones
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('estimaciones', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists estimaciones_insert on public.estimaciones;
create policy estimaciones_insert on public.estimaciones
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.puede('estimaciones', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists estimaciones_update on public.estimaciones;
create policy estimaciones_update on public.estimaciones
for update to authenticated
using (
  public.es_admin()
  or (
    public.puede('estimaciones', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
)
with check (
  public.es_admin()
  or (
    public.puede('estimaciones', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists estimaciones_delete on public.estimaciones;
create policy estimaciones_delete on public.estimaciones
for delete to authenticated
using (public.es_admin());

drop policy if exists estimacion_partidas_select on public.estimacion_partidas;
create policy estimacion_partidas_select on public.estimacion_partidas
for select to authenticated
using (
  public.es_admin()
  or exists (
    select 1
    from public.estimaciones e
    where e.id = estimacion_id
      and public.puede('estimaciones', 'ver')
      and public.tiene_acceso_proyecto(e.proyecto_id)
  )
);

-- Crea la estimación y sus partidas en una sola operación. Solo administración.
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
      and a.fecha <= p_fecha_fin;

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
  (select count(*) from public.estimaciones) as estimaciones,
  (select count(*) from public.estimacion_partidas) as partidas;
