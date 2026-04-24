-- Global/shared customer accounts and truck tares
-- These tables are intentionally shared across authenticated users.

create table if not exists public.customer_accounts (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_customer_accounts_name_lower
  on public.customer_accounts (lower(name));

alter table public.customer_accounts enable row level security;

drop policy if exists "customer_accounts_select_all_auth" on public.customer_accounts;
drop policy if exists "customer_accounts_insert_all_auth" on public.customer_accounts;
drop policy if exists "customer_accounts_update_all_auth" on public.customer_accounts;
drop policy if exists "customer_accounts_delete_all_auth" on public.customer_accounts;

create policy "customer_accounts_select_all_auth"
on public.customer_accounts
for select
using (auth.role() = 'authenticated');

create policy "customer_accounts_insert_all_auth"
on public.customer_accounts
for insert
with check (auth.role() = 'authenticated');

create policy "customer_accounts_update_all_auth"
on public.customer_accounts
for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "customer_accounts_delete_all_auth"
on public.customer_accounts
for delete
using (auth.role() = 'authenticated');

create table if not exists public.truck_tares (
  id text primary key,
  truck text not null,
  company_name text not null default '',
  tare_weight numeric not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_truck_tares_truck_lower
  on public.truck_tares (lower(truck));

alter table public.truck_tares enable row level security;

drop policy if exists "truck_tares_select_all_auth" on public.truck_tares;
drop policy if exists "truck_tares_insert_all_auth" on public.truck_tares;
drop policy if exists "truck_tares_update_all_auth" on public.truck_tares;
drop policy if exists "truck_tares_delete_all_auth" on public.truck_tares;

create policy "truck_tares_select_all_auth"
on public.truck_tares
for select
using (auth.role() = 'authenticated');

create policy "truck_tares_insert_all_auth"
on public.truck_tares
for insert
with check (auth.role() = 'authenticated');

create policy "truck_tares_update_all_auth"
on public.truck_tares
for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "truck_tares_delete_all_auth"
on public.truck_tares
for delete
using (auth.role() = 'authenticated');

