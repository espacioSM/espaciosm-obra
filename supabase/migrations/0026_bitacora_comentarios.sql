-- =============================================================================
-- espacioSM Obra · Seguimiento auditable de bitácora
-- Archivo: supabase/migrations/0026_bitacora_comentarios.sql
--
-- Ejecutar después de 0025.
--
-- Las entradas de bitácora quedan bloqueadas después de guardarse. El
-- seguimiento se agrega con comentarios inmutables, con autor y fecha.
-- =============================================================================

create table if not exists public.bitacora_comentarios (
  id uuid primary key default gen_random_uuid(),
  entrada_id uuid not null references public.bitacora (id) on delete cascade,
  comentario text not null,
  autor_id uuid references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  constraint bitacora_comentario_no_vacio check (btrim(comentario) <> '')
);

create index if not exists bitacora_comentarios_entrada_idx
  on public.bitacora_comentarios (entrada_id, creado_en);

create or replace function public.sellar_comentario_bitacora()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    new.autor_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists bitacora_comentarios_sellar on public.bitacora_comentarios;
create trigger bitacora_comentarios_sellar
before insert on public.bitacora_comentarios
for each row execute function public.sellar_comentario_bitacora();

-- La entrada original ya no se edita ni se borra desde la aplicación.
drop policy if exists bitacora_update on public.bitacora;
drop policy if exists bitacora_delete on public.bitacora;

alter table public.bitacora_comentarios enable row level security;

revoke all on public.bitacora_comentarios from anon;
grant select, insert, update, delete on public.bitacora_comentarios to authenticated;

drop policy if exists bitacora_comentarios_select on public.bitacora_comentarios;
create policy bitacora_comentarios_select on public.bitacora_comentarios
for select to authenticated
using (
  public.es_admin()
  or exists (
    select 1
    from public.bitacora b
    where b.id = entrada_id
      and public.puede('bitacora', 'ver')
      and public.tiene_acceso_proyecto(b.proyecto_id)
  )
);

drop policy if exists bitacora_comentarios_insert on public.bitacora_comentarios;
create policy bitacora_comentarios_insert on public.bitacora_comentarios
for insert to authenticated
with check (
  autor_id = auth.uid()
  and (
    public.es_admin()
    or exists (
      select 1
      from public.bitacora b
      where b.id = entrada_id
        and public.puede('bitacora', 'ver')
        and public.tiene_acceso_proyecto(b.proyecto_id)
    )
  )
);

create or replace function public.listar_comentarios_bitacora(p_proyecto_id uuid)
returns table (
  id uuid,
  entrada_id uuid,
  comentario text,
  autor_id uuid,
  autor_nombre text,
  autor_email text,
  creado_en timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id,
    c.entrada_id,
    c.comentario,
    c.autor_id,
    p.nombre,
    p.email,
    c.creado_en
  from public.bitacora_comentarios c
  join public.bitacora b on b.id = c.entrada_id
  join public.perfiles p on p.id = c.autor_id
  where b.proyecto_id = p_proyecto_id
    and public.tiene_acceso_proyecto(p_proyecto_id)
    and public.puede('bitacora', 'ver')
  order by c.creado_en;
$$;

revoke all on function public.listar_comentarios_bitacora(uuid) from public, anon;
revoke all on function public.sellar_comentario_bitacora() from public, anon;
grant execute on function public.listar_comentarios_bitacora(uuid) to authenticated;
grant execute on function public.sellar_comentario_bitacora() to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as comentarios from public.bitacora_comentarios;
