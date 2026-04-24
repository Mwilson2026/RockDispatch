-- Preferred name for UI (Settings). Email stays in auth.users only.

alter table public.profiles
  add column if not exists display_name text;

comment on column public.profiles.display_name is 'Shown in the nav greeting; users edit in Settings.';

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());
