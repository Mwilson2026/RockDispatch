-- Allow users to create their own profiles row if the auth trigger missed it (needed for display_name upsert flow).

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert
  with check (auth.uid() = id);
