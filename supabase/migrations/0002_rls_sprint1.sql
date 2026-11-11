-- =============================================================================
-- espacioSM Obra · Sprint 1 · Seguridad a nivel de fila (RLS)
-- Archivo: supabase/migrations/0002_rls_sprint1.sql
--
-- Se ejecuta después de 0001. Sin políticas, RLS bloquea todo: cada bloque de
-- aquí abre exactamente lo necesario.
--
-- Regla general:
--   admin         -> todo.
--   permiso_medio -> lo que diga rol_permisos, limitado a sus proyectos.
--   residente     -> captura y consulta dentro de sus proyectos.
-- =============================================================================

alter table public.perfiles enable row level security;
alter table public.proyectos enable row level security;
alter table public.proyecto_miembros enable row level security;
alter table public.empleados enable row level security;
alter table public.asistencia enable row level security;
alter table public.rol_permisos enable row level security;

-- El rol anónimo no toca ninguna tabla: sin sesión no hay datos.
revoke all on public.perfiles from anon;
revoke all on public.proyectos from anon;
revoke all on public.proyecto_miembros from anon;
revoke all on public.empleados from anon;
revoke all on public.asistencia from anon;
revoke all on public.rol_permisos from anon;

grant select, insert, update, delete on public.perfiles to authenticated;
grant select, insert, update, delete on public.proyectos to authenticated;
grant select, insert, update, delete on public.proyecto_miembros to authenticated;
grant select, insert, update, delete on public.empleados to authenticated;
grant select, insert, update, delete on public.asistencia to authenticated;
grant select on public.rol_permisos to authenticated;
grant insert, update, delete on public.rol_permisos to authenticated;

-- -----------------------------------------------------------------------------
-- perfiles
-- -----------------------------------------------------------------------------

-- Cada usuario ve su propio perfil; el admin ve y administra todos.
create policy perfiles_select on public.perfiles
for select to authenticated
using (id = auth.uid() or public.es_admin());

-- Un usuario puede corregir su nombre, pero no su rol ni desactivarse.
create policy perfiles_update_propio on public.perfiles
for update to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and activo
  and rol = public.rol_actual()
);

create policy perfiles_update_admin on public.perfiles
for update to authenticated
using (public.es_admin())
with check (public.es_admin());

-- Sin política de INSERT: los perfiles los crea el trigger desde auth.users.
-- Sin política de DELETE: las cuentas se eliminan desde Supabase Auth.

-- -----------------------------------------------------------------------------
-- proyectos
-- -----------------------------------------------------------------------------

create policy proyectos_select on public.proyectos
for select to authenticated
using (public.tiene_acceso_proyecto(id));

create policy proyectos_insert on public.proyectos
for insert to authenticated
with check (
  public.puede('proyectos', 'crear')
  and creado_por = auth.uid()
);

create policy proyectos_update on public.proyectos
for update to authenticated
using (
  public.es_admin()
  or (public.tiene_acceso_proyecto(id) and public.puede('proyectos', 'editar'))
)
with check (
  public.es_admin()
  or (public.tiene_acceso_proyecto(id) and public.puede('proyectos', 'editar'))
);

-- Borrar obra es irreversible y arrastra historial: solo admin.
create policy proyectos_delete on public.proyectos
for delete to authenticated
using (public.es_admin());

-- -----------------------------------------------------------------------------
-- proyecto_miembros
-- -----------------------------------------------------------------------------

create policy proyecto_miembros_select on public.proyecto_miembros
for select to authenticated
using (
  usuario_id = auth.uid()
  or public.es_admin()
  or public.tiene_acceso_proyecto(proyecto_id)
);

create policy proyecto_miembros_insert on public.proyecto_miembros
for insert to authenticated
with check (public.es_admin());

create policy proyecto_miembros_update on public.proyecto_miembros
for update to authenticated
using (public.es_admin())
with check (public.es_admin());

create policy proyecto_miembros_delete on public.proyecto_miembros
for delete to authenticated
using (public.es_admin());

-- -----------------------------------------------------------------------------
-- empleados
-- -----------------------------------------------------------------------------

create policy empleados_select on public.empleados
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('personal', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

create policy empleados_insert on public.empleados
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.puede('personal', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

create policy empleados_update on public.empleados
for update to authenticated
using (
  public.es_admin()
  or (
    public.puede('personal', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
)
with check (
  public.es_admin()
  or (
    public.puede('personal', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

create policy empleados_delete on public.empleados
for delete to authenticated
using (public.es_admin());

-- -----------------------------------------------------------------------------
-- asistencia
-- -----------------------------------------------------------------------------

create policy asistencia_select on public.asistencia
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('asistencia', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

-- El residente registra a su nombre (registrado_por = auth.uid()).
create policy asistencia_insert on public.asistencia
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.puede('asistencia', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
    and registrado_por = auth.uid()
  )
);

-- Permite completar la hora de salida o corregir el registro.
create policy asistencia_update on public.asistencia
for update to authenticated
using (
  public.es_admin()
  or (
    public.puede('asistencia', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
)
with check (
  public.es_admin()
  or (
    public.puede('asistencia', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

-- Un registro de asistencia no se borra: se corrige. Solo el admin puede.
create policy asistencia_delete on public.asistencia
for delete to authenticated
using (public.es_admin());

-- -----------------------------------------------------------------------------
-- rol_permisos
-- -----------------------------------------------------------------------------

-- La app lee la matriz (para pintar la interfaz). Solo admin la modifica,
-- y en la práctica se ajusta con migraciones SQL versionadas.
create policy rol_permisos_select on public.rol_permisos
for select to authenticated
using (true);

create policy rol_permisos_insert on public.rol_permisos
for insert to authenticated
with check (public.es_admin());

create policy rol_permisos_update on public.rol_permisos
for update to authenticated
using (public.es_admin())
with check (public.es_admin());

create policy rol_permisos_delete on public.rol_permisos
for delete to authenticated
using (public.es_admin());
