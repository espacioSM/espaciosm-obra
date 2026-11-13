-- =============================================================================
-- espacioSM Obra · Bitácora
-- Archivo: supabase/migrations/0025_bitacora.sql
--
-- Ejecutar después de 0024.
--
-- Notas diarias por obra con hasta tres fotos. El residente y la oficina
-- escriben; los miembros de la obra consultan.
-- =============================================================================

create table if not exists public.bitacora (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  fecha date not null default current_date,
  titulo text not null,
  contenido text not null,
  foto_paths text[] not null default '{}',
  registrado_por uuid references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint bitacora_titulo_no_vacio check (btrim(titulo) <> ''),
  constraint bitacora_contenido_no_vacio check (btrim(contenido) <> ''),
  constraint bitacora_max_tres_fotos check (cardinality(foto_paths) <= 3)
);

create index if not exists bitacora_proyecto_fecha_idx
  on public.bitacora (proyecto_id, fecha desc, creado_en desc);

drop trigger if exists bitacora_actualizado on public.bitacora;
create trigger bitacora_actualizado
before update on public.bitacora
for each row execute function public.marcar_actualizado();

alter table public.bitacora enable row level security;

revoke all on public.bitacora from anon;
grant select, insert, update, delete on public.bitacora to authenticated;

drop policy if exists bitacora_select on public.bitacora;
create policy bitacora_select on public.bitacora
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('bitacora', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists bitacora_insert on public.bitacora;
create policy bitacora_insert on public.bitacora
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.puede('bitacora', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
    and registrado_por = auth.uid()
  )
);

drop policy if exists bitacora_update on public.bitacora;
create policy bitacora_update on public.bitacora
for update to authenticated
using (
  public.es_admin()
  or (
    public.puede('bitacora', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
    and (
      public.rol_actual() <> 'residente'
      or registrado_por = auth.uid()
    )
  )
)
with check (
  public.es_admin()
  or (
    public.puede('bitacora', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
    and (
      public.rol_actual() <> 'residente'
      or registrado_por = auth.uid()
    )
  )
);

drop policy if exists bitacora_delete on public.bitacora;
create policy bitacora_delete on public.bitacora
for delete to authenticated
using (public.es_admin());

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as entradas from public.bitacora;
