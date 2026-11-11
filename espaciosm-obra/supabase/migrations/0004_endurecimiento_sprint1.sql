-- =============================================================================
-- espacioSM Obra · Sprint 1 · Endurecimiento
-- Archivo: supabase/migrations/0004_endurecimiento_sprint1.sql
--
-- Ejecutar después de 0003. Corrige hallazgos de la revisión de seguridad:
--   1. Una cuenta deshabilitada ya no conserva acceso a sus obras.
--   2. El rol, el estado y el correo del perfil no se pueden cambiar por API
--      fuera de las reglas, y un admin no puede quitarse a sí mismo el acceso.
--   3. La asistencia de los residentes se sella con hora y fecha del servidor,
--      no se puede reescribir y queda auditada en asistencia_historial.
--   4. Los DELETE respetan la columna "eliminar" de la matriz de permisos.
--   5. Las funciones quedan cerradas para anon y PUBLIC.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Acceso solo para cuentas activas
--
-- rol_actual() devuelve null si el perfil está inactivo o no existe. Hasta
-- ahora, tiene_acceso_proyecto() solo miraba la membresía, así que una cuenta
-- deshabilitada seguía viendo sus obras.
-- -----------------------------------------------------------------------------

create or replace function public.tiene_acceso_proyecto(p_proyecto_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.rol_actual() is not null
    and (
      public.es_admin()
      or exists (
        select 1
        from public.proyecto_miembros m
        where m.proyecto_id = p_proyecto_id
          and m.usuario_id = auth.uid()
      )
    );
$$;

-- La matriz también manda en la lectura de proyectos.
drop policy if exists proyectos_select on public.proyectos;

create policy proyectos_select on public.proyectos
for select to authenticated
using (
  public.tiene_acceso_proyecto(id)
  and public.puede('proyectos', 'ver')
);

-- -----------------------------------------------------------------------------
-- 2. La columna "eliminar" deja de ser decorativa
-- -----------------------------------------------------------------------------

drop policy if exists proyectos_delete on public.proyectos;

create policy proyectos_delete on public.proyectos
for delete to authenticated
using (
  public.puede('proyectos', 'eliminar')
  and public.tiene_acceso_proyecto(id)
);

drop policy if exists empleados_delete on public.empleados;

create policy empleados_delete on public.empleados
for delete to authenticated
using (public.puede('personal', 'eliminar') and public.tiene_acceso_proyecto(proyecto_id));

drop policy if exists asistencia_delete on public.asistencia;

create policy asistencia_delete on public.asistencia
for delete to authenticated
using (public.puede('asistencia', 'eliminar') and public.tiene_acceso_proyecto(proyecto_id));

-- -----------------------------------------------------------------------------
-- 3. Protección del perfil
--
-- La política RLS permitía tocar cualquier columna del propio perfil, y un
-- admin podía deshabilitarse o cambiarse el rol por API. Este trigger cierra
-- ambas cosas. Los procesos internos (SQL Editor, service_role, GoTrue) no
-- tienen auth.uid() y siguen pasando, que es lo que necesita el trigger de
-- sincronización de correo.
-- -----------------------------------------------------------------------------

create or replace function public.proteger_perfil()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  -- La sincronización de correo desde auth.users corre como proceso interno.
  if current_setting('app.sincronizando_email', true) = 'on' then
    return new;
  end if;

  -- El correo es espejo de auth.users: solo lo actualiza el trigger de
  -- sincronización.
  new.email := old.email;

  if not public.es_admin() then
    if new.rol is distinct from old.rol
       or new.activo is distinct from old.activo then
      raise exception 'Solo administración puede cambiar el rol o el estado de una cuenta'
        using errcode = '42501';
    end if;
  elsif old.id = auth.uid()
        and (
          new.rol is distinct from old.rol
          or new.activo is distinct from old.activo
        ) then
    raise exception 'No puedes cambiar tu propio rol ni deshabilitar tu cuenta'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists perfiles_proteger on public.perfiles;

create trigger perfiles_proteger
before update on public.perfiles
for each row execute function public.proteger_perfil();

-- La sincronización de correo se marca como proceso interno para que el
-- trigger de protección la deje pasar incluso si el JWT del usuario sigue
-- presente en la transacción de GoTrue.
create or replace function public.sincronizar_email_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform set_config('app.sincronizando_email', 'on', true);
  update public.perfiles set email = new.email where id = new.id;
  perform set_config('app.sincronizando_email', 'off', true);
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Asistencia: sellado en servidor e historial
-- -----------------------------------------------------------------------------

create table if not exists public.asistencia_historial (
  id bigint generated always as identity primary key,
  asistencia_id uuid not null,
  empleado_id uuid not null,
  proyecto_id uuid not null,
  operacion text not null check (operacion in ('alta', 'cambio', 'baja')),
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  usuario_id uuid,
  creado_en timestamptz not null default now()
);

comment on table public.asistencia_historial is
  'Bitácora inmutable de altas, cambios y bajas de asistencia. La escribe un trigger.';

create index if not exists asistencia_historial_proyecto_idx
  on public.asistencia_historial (proyecto_id, creado_en desc);

create index if not exists asistencia_historial_asistencia_idx
  on public.asistencia_historial (asistencia_id);

alter table public.asistencia_historial enable row level security;

revoke all on public.asistencia_historial from anon;
grant select on public.asistencia_historial to authenticated;

drop policy if exists asistencia_historial_select on public.asistencia_historial;

create policy asistencia_historial_select on public.asistencia_historial
for select to authenticated
using (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

-- Sella la asistencia que captura un residente:
--   * la fecha y la hora de entrada las pone el servidor (zona de la obra);
--   * no puede cambiar empleado, obra, fecha ni hora de entrada;
--   * no puede reabrir ni reescribir una jornada cerrada;
--   * registrado_por siempre es quien hace la operación.
-- Admin y permiso medio conservan la captura manual para corregir días
-- anteriores, pero tampoco pueden fechar en el futuro.
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
  -- SQL Editor, service_role y procesos internos: sin JWT de usuario.
  if auth.uid() is null then
    return new;
  end if;

  v_gestor := public.rol_actual() in ('admin', 'permiso_medio');

  if tg_op = 'INSERT' then
    if not v_gestor then
      new.fecha := v_hoy;
      new.hora_entrada := v_ahora;
      new.hora_salida := null;
      new.registrado_por := auth.uid();
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

      new.registrado_por := auth.uid();

      if new.hora_salida is not null then
        new.hora_salida := v_ahora;
      end if;
    end if;
  end if;

  if new.fecha > v_hoy then
    raise exception 'La fecha de asistencia no puede ser futura'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists asistencia_sellar on public.asistencia;

create trigger asistencia_sellar
before insert or update on public.asistencia
for each row execute function public.sellar_asistencia();

-- Historial: se escribe después de cada cambio, con el antes y el después.
create or replace function public.auditar_asistencia()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_empleado uuid;
  v_proyecto uuid;
  v_operacion text;
  v_antes jsonb;
  v_despues jsonb;
begin
  if tg_op = 'DELETE' then
    v_id := old.id;
    v_empleado := old.empleado_id;
    v_proyecto := old.proyecto_id;
    v_operacion := 'baja';
    v_antes := to_jsonb(old);
    v_despues := null;
  else
    v_id := new.id;
    v_empleado := new.empleado_id;
    v_proyecto := new.proyecto_id;
    v_operacion := case when tg_op = 'INSERT' then 'alta' else 'cambio' end;
    v_antes := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
    v_despues := to_jsonb(new);
  end if;

  insert into public.asistencia_historial (
    asistencia_id,
    empleado_id,
    proyecto_id,
    operacion,
    datos_anteriores,
    datos_nuevos,
    usuario_id
  ) values (
    v_id,
    v_empleado,
    v_proyecto,
    v_operacion,
    v_antes,
    v_despues,
    auth.uid()
  );

  return null;
end;
$$;

drop trigger if exists asistencia_auditar on public.asistencia;

create trigger asistencia_auditar
after insert or update or delete on public.asistencia
for each row execute function public.auditar_asistencia();

-- -----------------------------------------------------------------------------
-- 5. Cierre de permisos de ejecución
--
-- Supabase concede EXECUTE a anon y authenticated por defecto en el esquema
-- public. revoke ... from public no quita esa concesión explícita: hay que
-- nombrar a anon. Las funciones de trigger no se pueden invocar directamente,
-- pero también se cierran.
-- -----------------------------------------------------------------------------

revoke all on function public.rol_actual() from public, anon;
revoke all on function public.es_admin() from public, anon;
revoke all on function public.puede(public.modulo_sistema, public.accion_sistema) from public, anon;
revoke all on function public.tiene_acceso_proyecto(uuid) from public, anon;
revoke all on function public.mis_permisos() from public, anon;
revoke all on function public.mi_perfil() from public, anon;
revoke all on function public.empleados_de_proyecto(uuid) from public, anon;
revoke all on function public.conteo_personal_por_proyecto() from public, anon;

grant execute on function public.rol_actual() to authenticated;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.puede(public.modulo_sistema, public.accion_sistema) to authenticated;
grant execute on function public.tiene_acceso_proyecto(uuid) to authenticated;
grant execute on function public.mis_permisos() to authenticated;
grant execute on function public.mi_perfil() to authenticated;
grant execute on function public.empleados_de_proyecto(uuid) to authenticated;
grant execute on function public.conteo_personal_por_proyecto() to authenticated;

revoke all on function public.marcar_actualizado() from public, anon;
revoke all on function public.crear_perfil_nuevo_usuario() from public, anon;
revoke all on function public.sincronizar_email_usuario() from public, anon;
revoke all on function public.proteger_perfil() from public, anon;
revoke all on function public.sellar_asistencia() from public, anon;
revoke all on function public.auditar_asistencia() from public, anon;

grant execute on function public.marcar_actualizado() to authenticated;
grant execute on function public.proteger_perfil() to authenticated;
grant execute on function public.sellar_asistencia() to authenticated;
grant execute on function public.auditar_asistencia() to authenticated;

-- GoTrue usa su propio rol al crear usuarios; si existe, se le permite ejecutar
-- el trigger de alta de perfil. No se otorga a anon.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    begin
      execute 'grant execute on function public.crear_perfil_nuevo_usuario() to supabase_auth_admin';
      execute 'grant execute on function public.sincronizar_email_usuario() to supabase_auth_admin';
    exception when insufficient_privilege then
      raise warning 'No se pudo otorgar EXECUTE a supabase_auth_admin: %', sqlerrm;
    end;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Verificación
-- -----------------------------------------------------------------------------

-- No debe devolver filas.
select routine_name, grantee
from information_schema.routine_privileges
where routine_schema = 'public'
  and grantee in ('anon', 'PUBLIC');

-- Debe listar las políticas nuevas.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('proyectos', 'empleados', 'asistencia', 'asistencia_historial')
order by tablename, policyname;
