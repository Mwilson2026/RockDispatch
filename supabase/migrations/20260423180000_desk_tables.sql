-- Rock Dispatch: scale house + daily orders (synced from index.html when Supabase is configured)
-- Apply in dashboard: SQL Editor → New query → paste → Run
-- Or: supabase db push (linked project)

create table if not exists public.scale_tickets (
  id text primary key,
  ticket_date date not null,
  truck text not null default '',
  ticket text not null default '',
  net_tons numeric not null default 0,
  material text not null default '',
  time_text text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_scale_tickets_ticket_date on public.scale_tickets (ticket_date);

alter table public.scale_tickets enable row level security;

create policy "scale_tickets_allow_all"
on public.scale_tickets
for all
using (true)
with check (true);

comment on table public.scale_tickets is 'Trucks weighed at scale; app maps ticket_date ↔ JS date, time_text ↔ time';

create table if not exists public.daily_orders (
  id text primary key,
  order_date date not null,
  customer text not null default '',
  job text not null default '',
  material text not null default '',
  tons numeric not null default 0,
  loads int not null default 0,
  status text not null default 'Scheduled',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_daily_orders_order_date on public.daily_orders (order_date);

alter table public.daily_orders enable row level security;

create policy "daily_orders_allow_all"
on public.daily_orders
for all
using (true)
with check (true);

comment on table public.daily_orders is 'Customer orders by day; app maps order_date ↔ JS date';
