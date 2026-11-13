-- =============================================================================
-- espacioSM Obra · Actualización de catálogo, permisos y descripción
-- Archivo: supabase/actualizacion_0012_0014.sql
--
-- Ejecutar una vez en el proyecto actual. Incluye 0012, 0013 y 0014.
-- =============================================================================

-- ############################################################################
-- INICIO 0012_catalogo_ultimo_precio.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Catálogo que aprende y último precio
-- Archivo: supabase/migrations/0012_catalogo_ultimo_precio.sql
--
-- Ejecutar después de 0011.
--
--   1. Cada material nuevo se registra en el catálogo global.
--   2. El último precio capturado en un movimiento queda guardado.
--   3. El catálogo solo lo consultan administración y permiso medio.
-- =============================================================================

alter table public.catalogo_materiales
  add column if not exists origen text not null default 'base';

alter table public.catalogo_materiales
  add column if not exists creado_por uuid references public.perfiles (id);

alter table public.catalogo_materiales
  add column if not exists ultimo_precio numeric(12, 2);

alter table public.catalogo_materiales
  add column if not exists ultimo_precio_en timestamptz;

alter table public.materiales
  add column if not exists ultimo_precio numeric(12, 2);

alter table public.materiales
  add column if not exists ultimo_precio_en timestamptz;

create unique index if not exists catalogo_materiales_nombre_unidad_spec_idx
  on public.catalogo_materiales (
    lower(nombre),
    lower(unidad),
    lower(coalesce(especificacion, ''))
  );

-- Solo administración y permiso medio consultan el catálogo global.
drop policy if exists catalogo_materiales_select on public.catalogo_materiales;
create policy catalogo_materiales_select on public.catalogo_materiales
for select to authenticated
using (
  activo
  and (
    public.es_admin()
    or public.rol_actual() = 'permiso_medio'
  )
);

drop policy if exists catalogo_materiales_insert on public.catalogo_materiales;
create policy catalogo_materiales_insert on public.catalogo_materiales
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('materiales', 'crear')
  )
);

drop policy if exists catalogo_materiales_update on public.catalogo_materiales;
create policy catalogo_materiales_update on public.catalogo_materiales
for update to authenticated
using (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('materiales', 'editar')
  )
)
with check (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('materiales', 'editar')
  )
);

-- Aprende de cada material nuevo y lo liga al catálogo global.
create or replace function public.aprender_material()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_codigo text;
  v_unidad text := coalesce(nullif(btrim(new.unidad), ''), 'pieza');
begin
  if btrim(new.nombre) = '' then
    return new;
  end if;

  if new.catalogo_id is not null then
    if coalesce(new.costo_unitario, 0) > 0 then
      update public.catalogo_materiales
      set ultimo_precio = new.costo_unitario,
          ultimo_precio_en = now()
      where codigo = new.catalogo_id;
    end if;

    new.ultimo_precio := coalesce(nullif(new.costo_unitario, 0), new.ultimo_precio);
    if new.ultimo_precio is not null then
      new.ultimo_precio_en := now();
    end if;

    return new;
  end if;

  select c.codigo into v_codigo
  from public.catalogo_materiales c
  where lower(c.nombre) = lower(btrim(new.nombre))
    and lower(c.unidad) = lower(v_unidad)
    and lower(coalesce(c.especificacion, '')) = lower(coalesce(new.especificacion, ''))
  limit 1;

  if v_codigo is null then
    v_codigo := 'PROP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    insert into public.catalogo_materiales
      (codigo, categoria, nombre, especificacion, unidad, presentacion,
       precio_referencia, ultimo_precio, ultimo_precio_en, origen, creado_por)
    values
      (v_codigo, 'propio', btrim(new.nombre), new.especificacion, v_unidad,
       new.presentacion, nullif(new.costo_unitario, 0),
       nullif(new.costo_unitario, 0),
       case when coalesce(new.costo_unitario, 0) > 0 then now() else null end,
       'propio', auth.uid());
  else
    if coalesce(new.costo_unitario, 0) > 0 then
      update public.catalogo_materiales
      set ultimo_precio = new.costo_unitario,
          ultimo_precio_en = now()
      where codigo = v_codigo;
    end if;
  end if;

  new.catalogo_id := v_codigo;
  new.ultimo_precio := nullif(new.costo_unitario, 0);
  if new.ultimo_precio is not null then
    new.ultimo_precio_en := now();
  end if;

  return new;
end;
$$;

drop trigger if exists materiales_aprender on public.materiales;
create trigger materiales_aprender
before insert on public.materiales
for each row execute function public.aprender_material();

-- Guarda el último precio real capturado en una entrada o salida.
create or replace function public.actualizar_ultimo_precio_material()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.costo_unitario, 0) <= 0 then
    return new;
  end if;

  update public.materiales
  set ultimo_precio = new.costo_unitario,
      ultimo_precio_en = now()
  where id = new.material_id;

  update public.catalogo_materiales c
  set ultimo_precio = new.costo_unitario,
      ultimo_precio_en = now()
  from public.materiales m
  where m.id = new.material_id
    and c.codigo = m.catalogo_id;

  return new;
end;
$$;

drop trigger if exists material_movimientos_precio on public.material_movimientos;
create trigger material_movimientos_precio
after insert or update of costo_unitario on public.material_movimientos
for each row execute function public.actualizar_ultimo_precio_material();

revoke all on function public.aprender_material() from public, anon;
revoke all on function public.actualizar_ultimo_precio_material() from public, anon;
grant execute on function public.aprender_material() to authenticated;
grant execute on function public.actualizar_ultimo_precio_material() to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select
  (select count(*) from public.catalogo_materiales) as catalogo,
  (select count(*) from public.catalogo_materiales where origen = 'propio') as propios;

-- ############################################################################
-- INICIO 0013_materiales_solo_gestion.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Materiales solo para administración y permiso medio
-- Archivo: supabase/migrations/0013_materiales_solo_gestion.sql
--
-- Ejecutar después de 0012.
--
-- El residente puede consultar materiales de su obra, pero no crear materiales
-- ni registrar entradas o salidas. La captura queda para administración y
-- permiso medio.
-- =============================================================================

update public.rol_permisos
set permitido = false
where rol = 'residente'
  and modulo = 'materiales'
  and accion in ('crear', 'editar');

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select
  (select count(*) from public.rol_permisos
   where rol = 'residente' and modulo = 'materiales' and permitido) as permisos_materiales_residente;

-- ############################################################################
-- INICIO 0014_movimiento_descripcion.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Descripción del material en movimientos
-- Archivo: supabase/migrations/0014_movimiento_descripcion.sql
--
-- Ejecutar después de 0013.
--
-- Agrega una descripción propia del material en cada entrada o salida,
-- independiente de la nota.
-- =============================================================================

alter table public.material_movimientos
  add column if not exists descripcion text;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as movimientos from public.material_movimientos;

-- -----------------------------------------------------------------------------
-- Verificación final
-- -----------------------------------------------------------------------------

select
  (select count(*) from public.rol_permisos
   where rol = 'residente' and modulo = 'materiales' and permitido)
   as permisos_materiales_residente,
  (select count(*) from public.catalogo_materiales) as catalogo;