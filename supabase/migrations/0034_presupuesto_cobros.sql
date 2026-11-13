-- =============================================================================
-- espacioSM Obra · Presupuesto y cobros del cliente
-- Archivo: supabase/migrations/0034_presupuesto_cobros.sql
--
-- Ejecutar después de 0033.
--
-- Registra el monto contractual, el anticipo y los cobros al cliente:
-- anticipo, pago por estimación y liquidación.
-- =============================================================================

do $$
begin
  create type public.tipo_cobro as enum ('anticipo', 'estimacion', 'liquidacion', 'otro');
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.presupuestos (
  proyecto_id uuid primary key references public.proyectos (id) on delete cascade,
  monto_contrato numeric(14, 2) not null default 0,
  anticipo_porcentaje numeric(5, 2) not null default 0,
  notas text,
  actualizado_por uuid references public.perfiles (id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint presupuesto_monto_no_negativo check (monto_contrato >= 0),
  constraint presupuesto_anticipo_valido
    check (anticipo_porcentaje >= 0 and anticipo_porcentaje <= 100)
);

create table if not exists public.cobros_cliente (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  estimacion_id uuid references public.estimaciones (id) on delete set null,
  tipo public.tipo_cobro not null,
  monto numeric(14, 2) not null,
  fecha date not null default current_date,
  referencia text,
  nota text,
  registrado_por uuid references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  constraint cobro_monto_positivo check (monto > 0)
);

create index if not exists cobros_cliente_proyecto_fecha_idx
  on public.cobros_cliente (proyecto_id, fecha desc);

drop trigger if exists presupuestos_actualizado on public.presupuestos;
create trigger presupuestos_actualizado
before update on public.presupuestos
for each row execute function public.marcar_actualizado();

alter table public.presupuestos enable row level security;
alter table public.cobros_cliente enable row level security;

revoke all on public.presupuestos from anon;
revoke all on public.cobros_cliente from anon;
grant select, insert, update on public.presupuestos to authenticated;
grant select, insert on public.cobros_cliente to authenticated;

drop policy if exists presupuestos_select on public.presupuestos;
create policy presupuestos_select on public.presupuestos
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('pagos', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists presupuestos_insert on public.presupuestos;
create policy presupuestos_insert on public.presupuestos
for insert to authenticated
with check (public.es_admin());

drop policy if exists presupuestos_update on public.presupuestos;
create policy presupuestos_update on public.presupuestos
for update to authenticated
using (public.es_admin())
with check (public.es_admin());

drop policy if exists cobros_cliente_select on public.cobros_cliente;
create policy cobros_cliente_select on public.cobros_cliente
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('pagos', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists cobros_cliente_insert on public.cobros_cliente;
create policy cobros_cliente_insert on public.cobros_cliente
for insert to authenticated
with check (
  public.es_admin()
  and registrado_por = auth.uid()
  and public.tiene_acceso_proyecto(proyecto_id)
);

-- Los cobros son auditables: no se editan ni se borran desde la aplicación.
drop policy if exists cobros_cliente_update on public.cobros_cliente;
drop policy if exists cobros_cliente_delete on public.cobros_cliente;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as presupuestos from public.presupuestos;
select count(*) as cobros from public.cobros_cliente;
