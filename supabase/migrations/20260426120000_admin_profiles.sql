-- Admin role via profiles + is_admin(); RLS allows admins full access to app tables.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

comment on function public.is_admin() is 'True when the signed-in user has profiles.role = admin';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role) values (new.id, 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, role)
select id, 'user' from auth.users
on conflict (id) do nothing;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

-- ---------- scale_tickets ----------
drop policy if exists "scale_tickets_select_own" on public.scale_tickets;
drop policy if exists "scale_tickets_insert_own" on public.scale_tickets;
drop policy if exists "scale_tickets_update_own" on public.scale_tickets;
drop policy if exists "scale_tickets_delete_own" on public.scale_tickets;

create policy "scale_tickets_select_own" on public.scale_tickets for select
  using (auth.uid() = user_id or public.is_admin());
create policy "scale_tickets_insert_own" on public.scale_tickets for insert
  with check (auth.uid() = user_id or public.is_admin());
create policy "scale_tickets_update_own" on public.scale_tickets for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());
create policy "scale_tickets_delete_own" on public.scale_tickets for delete
  using (auth.uid() = user_id or public.is_admin());

-- ---------- daily_orders ----------
drop policy if exists "daily_orders_select_own" on public.daily_orders;
drop policy if exists "daily_orders_insert_own" on public.daily_orders;
drop policy if exists "daily_orders_update_own" on public.daily_orders;
drop policy if exists "daily_orders_delete_own" on public.daily_orders;

create policy "daily_orders_select_own" on public.daily_orders for select
  using (auth.uid() = user_id or public.is_admin());
create policy "daily_orders_insert_own" on public.daily_orders for insert
  with check (auth.uid() = user_id or public.is_admin());
create policy "daily_orders_update_own" on public.daily_orders for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());
create policy "daily_orders_delete_own" on public.daily_orders for delete
  using (auth.uid() = user_id or public.is_admin());

-- ---------- load_templates ----------
drop policy if exists "load_templates_select_own" on public.load_templates;
drop policy if exists "load_templates_insert_own" on public.load_templates;
drop policy if exists "load_templates_update_own" on public.load_templates;
drop policy if exists "load_templates_delete_own" on public.load_templates;

create policy "load_templates_select_own" on public.load_templates for select
  using (auth.uid() = user_id or public.is_admin());
create policy "load_templates_insert_own" on public.load_templates for insert
  with check (auth.uid() = user_id or public.is_admin());
create policy "load_templates_update_own" on public.load_templates for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());
create policy "load_templates_delete_own" on public.load_templates for delete
  using (auth.uid() = user_id or public.is_admin());

-- ---------- issued_quotes ----------
drop policy if exists "issued_quotes_select_own" on public.issued_quotes;
drop policy if exists "issued_quotes_insert_own" on public.issued_quotes;
drop policy if exists "issued_quotes_update_own" on public.issued_quotes;
drop policy if exists "issued_quotes_delete_own" on public.issued_quotes;

create policy "issued_quotes_select_own" on public.issued_quotes for select
  using (auth.uid() = user_id or public.is_admin());
create policy "issued_quotes_insert_own" on public.issued_quotes for insert
  with check (auth.uid() = user_id or public.is_admin());
create policy "issued_quotes_update_own" on public.issued_quotes for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());
create policy "issued_quotes_delete_own" on public.issued_quotes for delete
  using (auth.uid() = user_id or public.is_admin());

-- ---------- pinned_template_ids: add template_owner_id (which user owns the template row) ----------
drop policy if exists "pinned_select_own" on public.pinned_template_ids;
drop policy if exists "pinned_insert_own" on public.pinned_template_ids;
drop policy if exists "pinned_update_own" on public.pinned_template_ids;
drop policy if exists "pinned_delete_own" on public.pinned_template_ids;

alter table public.pinned_template_ids drop constraint if exists pinned_template_ids_pkey;
delete from public.pinned_template_ids;

alter table public.pinned_template_ids
  add column if not exists template_owner_id uuid references auth.users (id) on delete cascade;

alter table public.pinned_template_ids alter column template_owner_id set default auth.uid();
update public.pinned_template_ids set template_owner_id = auth.uid() where template_owner_id is null;
alter table public.pinned_template_ids alter column template_owner_id set not null;

alter table public.pinned_template_ids add primary key (user_id, template_owner_id, template_id);

create policy "pinned_select_own" on public.pinned_template_ids for select
  using (auth.uid() = user_id or public.is_admin());
create policy "pinned_insert_own" on public.pinned_template_ids for insert
  with check (auth.uid() = user_id or public.is_admin());
create policy "pinned_update_own" on public.pinned_template_ids for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());
create policy "pinned_delete_own" on public.pinned_template_ids for delete
  using (auth.uid() = user_id or public.is_admin());

comment on column public.pinned_template_ids.template_owner_id is 'auth.users id of the load_templates row owner (pins reference template_id within that owner namespace)';
