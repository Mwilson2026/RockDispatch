-- Per-user data with Supabase Auth. Clears existing anonymous-era rows (no user_id).
-- After this migration, only signed-in users can read/write their own rows.

-- ---------- scale_tickets ----------
alter table public.scale_tickets drop constraint if exists scale_tickets_pkey;
alter table public.scale_tickets add column if not exists user_id uuid references auth.users (id) on delete cascade;
delete from public.scale_tickets;
alter table public.scale_tickets alter column user_id set default auth.uid();
alter table public.scale_tickets alter column user_id set not null;
alter table public.scale_tickets add primary key (user_id, id);

drop policy if exists "scale_tickets_allow_all" on public.scale_tickets;
create policy "scale_tickets_select_own" on public.scale_tickets for select using (auth.uid() = user_id);
create policy "scale_tickets_insert_own" on public.scale_tickets for insert with check (auth.uid() = user_id);
create policy "scale_tickets_update_own" on public.scale_tickets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "scale_tickets_delete_own" on public.scale_tickets for delete using (auth.uid() = user_id);

-- ---------- daily_orders ----------
alter table public.daily_orders drop constraint if exists daily_orders_pkey;
alter table public.daily_orders add column if not exists user_id uuid references auth.users (id) on delete cascade;
delete from public.daily_orders;
alter table public.daily_orders alter column user_id set default auth.uid();
alter table public.daily_orders alter column user_id set not null;
alter table public.daily_orders add primary key (user_id, id);

drop policy if exists "daily_orders_allow_all" on public.daily_orders;
create policy "daily_orders_select_own" on public.daily_orders for select using (auth.uid() = user_id);
create policy "daily_orders_insert_own" on public.daily_orders for insert with check (auth.uid() = user_id);
create policy "daily_orders_update_own" on public.daily_orders for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "daily_orders_delete_own" on public.daily_orders for delete using (auth.uid() = user_id);

-- ---------- load_templates ----------
alter table public.load_templates drop constraint if exists load_templates_pkey;
alter table public.load_templates add column if not exists user_id uuid references auth.users (id) on delete cascade;
delete from public.load_templates;
alter table public.load_templates alter column user_id set default auth.uid();
alter table public.load_templates alter column user_id set not null;
alter table public.load_templates add primary key (user_id, id);

drop policy if exists "load_templates_allow_all" on public.load_templates;
create policy "load_templates_select_own" on public.load_templates for select using (auth.uid() = user_id);
create policy "load_templates_insert_own" on public.load_templates for insert with check (auth.uid() = user_id);
create policy "load_templates_update_own" on public.load_templates for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "load_templates_delete_own" on public.load_templates for delete using (auth.uid() = user_id);

-- ---------- issued_quotes ----------
alter table public.issued_quotes drop constraint if exists issued_quotes_pkey;
alter table public.issued_quotes add column if not exists user_id uuid references auth.users (id) on delete cascade;
delete from public.issued_quotes;
alter table public.issued_quotes alter column user_id set default auth.uid();
alter table public.issued_quotes alter column user_id set not null;
alter table public.issued_quotes add primary key (user_id, id);

drop policy if exists "issued_quotes_allow_all" on public.issued_quotes;
create policy "issued_quotes_select_own" on public.issued_quotes for select using (auth.uid() = user_id);
create policy "issued_quotes_insert_own" on public.issued_quotes for insert with check (auth.uid() = user_id);
create policy "issued_quotes_update_own" on public.issued_quotes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "issued_quotes_delete_own" on public.issued_quotes for delete using (auth.uid() = user_id);

-- ---------- pinned_template_ids ----------
alter table public.pinned_template_ids drop constraint if exists pinned_template_ids_pkey;
alter table public.pinned_template_ids add column if not exists user_id uuid references auth.users (id) on delete cascade;
delete from public.pinned_template_ids;
alter table public.pinned_template_ids alter column user_id set default auth.uid();
alter table public.pinned_template_ids alter column user_id set not null;
alter table public.pinned_template_ids add primary key (user_id, template_id);

drop policy if exists "pinned_template_ids_allow_all" on public.pinned_template_ids;
create policy "pinned_select_own" on public.pinned_template_ids for select using (auth.uid() = user_id);
create policy "pinned_insert_own" on public.pinned_template_ids for insert with check (auth.uid() = user_id);
create policy "pinned_update_own" on public.pinned_template_ids for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "pinned_delete_own" on public.pinned_template_ids for delete using (auth.uid() = user_id);
