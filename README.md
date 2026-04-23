# RockDispatch

Front-end dispatch UI (`index.html`). Scale desk data can stay in the browser only, or sync to **Supabase** when you add your project keys.

## Supabase setup

1. Create a free project at [supabase.com](https://supabase.com) (same idea as creating a GitHub repo: new organization/project, pick a database password, wait for provisioning).
2. In the dashboard go to **Project Settings → API** and copy **Project URL** and the **anon public** key.
3. Paste them into `supabase-config.js` as `window.SUPABASE_URL` and `window.SUPABASE_ANON_KEY` (see `supabase-config.example.js`).
4. Open **SQL Editor → New query**, paste the contents of `supabase/migrations/20260423180000_desk_tables.sql`, and **Run** to create `scale_tickets` and `daily_orders`.
5. Reload the app. With keys set, the Scale desk loads and saves tickets/orders to Supabase (and still mirrors to `localStorage` as a cache).

**CLI (optional):** with Node.js you can run `npx supabase login`, `npx supabase link --project-ref <ref>`, and `npx supabase db push` to apply migrations from this folder instead of pasting SQL.

Row Level Security policies in the migration are permissive (`using (true)`) so the anon key works from static hosting. Tighten policies before production (e.g. require authenticated users).
