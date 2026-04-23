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

The UI is split into **routes** so you can work on one area at a time: `/` (home + hero), `/desk`, `/loads`, `/ops`, `/builder`, `/admin`, and `/load/<template-id>` for a load plan detail. Nav links use real URLs; production uses `vercel.json` so refresh/deep links resolve to the app.

## Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **Project Settings → API:** copy **Project URL** and the **publishable** or **anon** key (not the secret key).
3. Put them in `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. **SQL Editor:** run the migrations in order (or `npx supabase db push` if linked):
   - `supabase/migrations/20260423180000_desk_tables.sql` — `scale_tickets`, `daily_orders`
   - `supabase/migrations/20260424190000_dispatch_backend.sql` — `load_templates`, `issued_quotes`, `pinned_template_ids`

With env vars set, the app syncs the **scale desk**, **load templates** (merged with built-in defaults), **issued dispatch rows**, and **pinned** template ids.

### Authentication (required for cloud sync)

1. Run migration `supabase/migrations/20260425110000_auth_rls.sql` after the earlier migrations. It adds `user_id` to every table, **clears old rows** that had no owner, and replaces open policies with **row-level security** so each user only sees their own data.
2. Run migration `supabase/migrations/20260426120000_admin_profiles.sql`. It adds a **`profiles`** table (`role`: `user` | `admin`), an **`is_admin()`** helper used by RLS, auto-creates a profile row for new sign-ups, extends **pinned** rows with **`template_owner_id`** (so pins stay unique when many users share template ids), and lets **admins** read/update all rows on the app tables.
3. In Supabase **Authentication → Providers**, keep **Email** enabled. For development you can turn off **Confirm email** under **Authentication → Providers → Email** so sign-up can sign in immediately.
4. Sign up or sign in from the app modal. The **Login** button shows your email prefix when signed in (**`… · Admin`** when your profile is `admin`); click it to **sign out**. Until you sign in, the modal stays required (no dismiss) when using Supabase.

Without `VITE_SUPABASE_*` env vars, the app stays in **offline** mode (localStorage only, demo login allowed).

### Who can log in (no default user)

Supabase uses **email + password** (there is no separate “username” field unless you treat email as the username).

- **There is no default account** in the app or repo — that would be a security risk.
- **Invite-only (recommended):** Do **not** set `VITE_ALLOW_PUBLIC_SIGNUP` (or set it to anything other than `true`). The sign-in modal then only offers **Sign in**. You create each person’s account yourself:
  1. Supabase **Authentication → Users → Add user** → enter **email**, **password**, and confirm.
  2. They sign in at your deployed URL with that email and password.
- **Optional:** In Supabase **Authentication** settings, disable **public sign-ups** / **allow new users** if your project exposes that toggle — then even API-based `signUp` calls are refused (defense in depth alongside the UI).
- **Self-registration (dev only):** Set `VITE_ALLOW_PUBLIC_SIGNUP=true` in `.env.local` and Vercel if you want the **Create account** tab back.

### Admin access (full org view in the web app)

There is no safe way to ship a fixed default password in the repo. Create your own operator account and promote it:

1. In Supabase **Authentication → Users**, add a user (email + password) or register from the app.
2. In **SQL Editor**, grant admin (replace the email):

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'you@company.com' limit 1);
```

3. Sign out and sign back in (or refresh). The nav button shows **`… · Admin`** when `role = 'admin'`. Admins see **everyone’s** scale tickets, orders, templates, issued quotes, and pins through RLS; regular users still see only their own rows.

**Security:** keep admin accounts few; only the **anon** key belongs in `VITE_*` env vars—never the service role key in the frontend.

Optional: `npx supabase link` / `npx supabase db push` instead of pasting SQL.

### Login errors (“URL path not recognized”, “requested path is invalid”)

These almost always mean **`VITE_SUPABASE_URL` is wrong**, not your email/password.

1. In Supabase: **Project Settings → API**, copy **Project URL**. It must look exactly like `https://xxxxxxxx.supabase.co` — **no** `/rest/v1`, `/auth/v1`, or anything after `.co`.
2. Put that value in **`.env.local`** (local) and **Vercel → Settings → Environment Variables** (production). Names must be **`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_ANON_KEY`** (the `VITE_` prefix is required so Vite exposes them).
3. **Redeploy** on Vercel after changing env vars; restart `npm run dev` locally.
4. If the user was added in the dashboard, ensure they have a **password** (or use **Reset password**). Turn off **Confirm email** for testing if sign-in still fails with “email not confirmed”.

## Deploy on Vercel

1. Import the GitHub repo in [Vercel](https://vercel.com).
2. Framework preset: **Vite** (or Other — **Build Command:** `npm run build`, **Output Directory:** `dist`).
3. **Settings → Environment Variables:** add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same values as local).
4. Deploy. No API keys belong in `index.html`; Vite injects them at build time.
