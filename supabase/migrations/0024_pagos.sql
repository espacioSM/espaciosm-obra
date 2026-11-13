-- =============================================================================
-- espacioSM Obra · Pagos
-- Archivo: supabase/migrations/0024_pagos.sql
--
-- Ejecutar después de 0023.
--
-- Registro de pagos por obra. Administración captura y corrige; permiso medio
-- consulta; residente no tiene acceso.
-- =============================================================================

do $$
begin
  create type public.tipo_pago as enum (
    'personal', 'proveedor', 'contratista', 'otro'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.metodo_pago as enum (
    'efectivo', 'transferencia', 'cheque', 'otro'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  tipo public.tipo_pago not null default 'proveedor',
  beneficiario text not null,
  concepto text not null,
  monto numeric(14, 2) not null,
  fecha date not null default current_date,
  metodo public.metodo_pago not null default 'transferencia',
  referencia text,
  nota text,
  registrado_por uuid references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint pagos_beneficiario_no_vacio check (btrim(beneficiario) <> ''),
  constraint pagos_concepto_no_vacio check (btrim(concepto) <> ''),
  constraint pagos_monto_positivo check (monto > 0)
);

create index if not exists pagos_proyecto_fecha_idx
  on public.pagos (proyecto_id, fecha desc);

drop trigger if exists pagos_actualizado on public.pagos;
create trigger pagos_actualizado
before update on public.pagos
for each row execute function public.marcar_actualizado();

alter table public.pagos enable row level security;

revoke all on public.pagos from anon;
grant select, insert, update, delete on public.pagos to authenticated;

drop policy if exists pagos_select on public.pagos;
create policy pagos_select on public.pagos
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('pagos', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists pagos_insert on public.pagos;
create policy pagos_insert on public.pagos
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.puede('pagos', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
    and registrado_por = auth.uid()
  )
);

drop policy if exists pagos_update on public.pagos;
create policy pagos_update on public.pagos
for update to authenticated
using (
  public.es_admin()
  or (
    public.puede('pagos', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
)
with check (
  public.es_admin()
  or (
    public.puede('pagos', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists pagos_delete on public.pagos;
create policy pagos_delete on public.pagos
for delete to authenticated
using (public.es_admin());

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as pagos from public.pagos;
