# RockDispatch

Vite + vanilla JS single-page app. Scale data uses **localStorage** offline, or syncs to **Supabase** when environment variables are set.

## Local development

```bash
npm install
cp .env.example .env.local
# Edit .env.local — use publishable/anon key only (never sb_secret_)
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

The UI is split into **routes** so you can work on one area at a time: **`/`** is the **Orders** board (same as `/orders` or `/loads`), plus `/desk`, `/settings`, `/builder`, `/admin`, and `/load/<template-id>` for a load plan detail. Nav links use real URLs; production uses `vercel.json` so refresh/deep links resolve to the app.

**Local browser storage:** sales orders (`rockDispatch_salesOrders_v1`), customer account names for the Orders dropdown (`rockDispatch_customerAccounts_v1`), and theme (`rockDispatch_theme`). Only users with **admin** profile role can add/rename/delete customer accounts on the Settings page; wire Supabase later for shared data across devices.

## Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **Project Settings → API:** copy **Project URL** and the **publishable** or **anon** key (not the secret key).
3. Put them in `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Optional: set `VITE_AUTH_EMAIL_DOMAIN` (see Authentication below). If unset, the app uses `users.rockdispatch.local` when turning usernames into the synthetic email Supabase expects.
5. **SQL Editor:** run the migrations in order (or `npx supabase db push` if linked):
   - `supabase/migrations/20260423180000_desk_tables.sql` — `scale_tickets`, `daily_orders`
   - `supabase/migrations/20260424190000_dispatch_backend.sql` — `load_templates`, `issued_quotes`, `pinned_template_ids`

With env vars set, the app syncs the **scale** view, **load templates** (merged with built-in defaults), **issued dispatch rows**, and **pinned** template ids.

### Authentication (required for cloud sync)

1. Run migration `supabase/migrations/20260425110000_auth_rls.sql` after the earlier migrations. It adds `user_id` to every table, **clears old rows** that had no owner, and replaces open policies with **row-level security** so each user only sees their own data.
2. Run migration `supabase/migrations/20260426120000_admin_profiles.sql`. It adds a **`profiles`** table (`role`: `user` | `admin`), an **`is_admin()`** helper used by RLS, auto-creates a profile row for new sign-ups, extends **pinned** rows with **`template_owner_id`** (so pins stay unique when many users share template ids), and lets **admins** read/update all rows on the app tables.
3. In Supabase **Authentication → Providers**, keep **Email** enabled. For development you can turn off **Confirm email** under **Authentication → Providers → Email** so sign-up can sign in immediately.
4. Sign up or sign in from the app modal. The **Login** button shows your name or username when signed in (**`… · Admin`** when your profile is `admin`); click it to **sign out**. Until you sign in, the modal stays required (no dismiss) when using Supabase.

Without `VITE_SUPABASE_*` env vars, the app stays in **offline** mode (localStorage only, demo login allowed).

### Who can log in (no default user)

The sign-in form asks for a **username** and password. Supabase’s email/password provider still stores an email internally; the app maps `username` → `username@YOUR_DOMAIN` using **`VITE_AUTH_EMAIL_DOMAIN`** (default `users.rockdispatch.local`). Keep that domain the same in **`.env.local` / Vercel** and when you invite users.

- **There is no default account** in the app or repo — that would be a security risk.
- **Invite-only (recommended):** Do **not** set `VITE_ALLOW_PUBLIC_SIGNUP` (or set it to anything other than `true`). The sign-in modal then only offers **Sign in**. You create each person’s account yourself:
  1. Supabase **Authentication → Users → Add user** → set **Email** to `{username}@{VITE_AUTH_EMAIL_DOMAIN}` (for example `alex@users.rockdispatch.local` when using defaults), **password**, and confirm. Optionally set **User Metadata → `full_name`** for display.
  2. They sign in at your deployed URL with **username** `alex` (not the full synthetic address) and their password.
- **Legacy:** If a user was created with a normal email like `person@company.com`, they can still sign in by typing that **full email** in the username field (the app detects `@` and signs in with that email).
- **Optional:** In Supabase **Authentication** settings, disable **public sign-ups** / **allow new users** if your project exposes that toggle — then even API-based `signUp` calls are refused (defense in depth alongside the UI).
- **Self-registration (dev only):** Set `VITE_ALLOW_PUBLIC_SIGNUP=true` in `.env.local` and Vercel if you want the **Create account** tab back.

### Admin access (full org view in the web app)

There is no safe way to ship a fixed default password in the repo. Create your own operator account and promote it:

1. In Supabase **Authentication → Users**, add a user (email + password) or register from the app.
2. In **SQL Editor**, grant admin (replace with that user’s auth email — synthetic or real):

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'alex@users.rockdispatch.local' limit 1);
```

3. Sign out and sign back in (or refresh). The nav button shows **`… · Admin`** when `role = 'admin'`. Admins see **everyone’s** scale tickets, orders, templates, issued quotes, and pins through RLS; regular users still see only their own rows.

**Security:** keep admin accounts few; only the **anon** key belongs in `VITE_*` env vars—never the service role key in the frontend.

Optional: `npx supabase link` / `npx supabase db push` instead of pasting SQL.

### Login errors (“URL path not recognized”, “requested path is invalid”)

These almost always mean **`VITE_SUPABASE_URL` is wrong**, not your username or password.

1. In Supabase: **Project Settings → API**, copy **Project URL**. It must look exactly like `https://xxxxxxxx.supabase.co` — **no** `/rest/v1`, `/auth/v1`, or anything after `.co`.
2. Put that value in **`.env.local`** (local) and **Vercel → Settings → Environment Variables** (production). Names must be **`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_ANON_KEY`** (the `VITE_` prefix is required so Vite exposes them).
3. **Redeploy** on Vercel after changing env vars; restart `npm run dev` locally.
4. If the user was added in the dashboard, ensure they have a **password** (or use **Reset password**). Turn off **Confirm email** for testing if sign-in still fails with “email not confirmed”.

## Deploy on Vercel

1. Import the GitHub repo in [Vercel](https://vercel.com).
2. Framework preset: **Vite** (or Other — **Build Command:** `npm run build`, **Output Directory:** `dist`).
3. **Settings → Environment Variables:** add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same values as local).
4. Deploy. No API keys belong in `index.html`; Vite injects them at build time.
