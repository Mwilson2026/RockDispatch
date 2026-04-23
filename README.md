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
4. **SQL Editor:** run `supabase/migrations/20260423180000_desk_tables.sql`.

Optional: `npx supabase link` / `npx supabase db push` instead of pasting SQL.

## Deploy on Vercel

1. Import the GitHub repo in [Vercel](https://vercel.com).
2. Framework preset: **Vite** (or Other — **Build Command:** `npm run build`, **Output Directory:** `dist`).
3. **Settings → Environment Variables:** add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same values as local).
4. Deploy. No API keys belong in `index.html`; Vite injects them at build time.
