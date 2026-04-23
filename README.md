# RockDispatch

Vite + vanilla JS single-page app. Scale desk data uses **localStorage** offline, or syncs to **Supabase** when environment variables are set.

## Local development

```bash
npm install
cp .env.example .env.local
# Edit .env.local — use publishable/anon key only (never sb_secret_)
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **Project Settings → API:** copy **Project URL** and the **publishable** or **anon** key (not the secret key).
3. Put them in `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. **SQL Editor:** run the migrations in order (or `npx supabase db push` if linked):
   - `supabase/migrations/20260423180000_desk_tables.sql` — `scale_tickets`, `daily_orders`
   - `supabase/migrations/20260424190000_dispatch_backend.sql` — `load_templates`, `issued_quotes`, `pinned_template_ids`

With env vars set, the app syncs the **scale desk**, **load templates** (merged with built-in defaults), **issued dispatch rows**, and **pinned** template ids.

Optional: `npx supabase link` / `npx supabase db push` instead of pasting SQL.

## Deploy on Vercel

1. Import the GitHub repo in [Vercel](https://vercel.com).
2. Framework preset: **Vite** (or Other — **Build Command:** `npm run build`, **Output Directory:** `dist`).
3. **Settings → Environment Variables:** add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same values as local).
4. Deploy. No API keys belong in `index.html`; Vite injects them at build time.
