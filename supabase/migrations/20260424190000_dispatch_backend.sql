-- Load plan templates (admin + overrides of defaults), issued haul sheets, pinned template ids

create table if not exists public.load_templates (
  id integer primary key,
  name text not null default '',
  category text not null default '',
  amount numeric not null default 0,
  status text not null default 'Draft',
  customer text not null default '',
  project text not null default '',
  issue_date date,
  valid_through date,
  terms text not null default '',
  description text not null default '',
  specs jsonb not null default '[]'::jsonb,
  line_items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_load_templates_category on public.load_templates (category);

alter table public.load_templates enable row level security;

create policy "load_templates_allow_all"
on public.load_templates
for all
using (true)
with check (true);

comment on table public.load_templates is 'Dispatch/load plans; line_items/specs are JSON arrays matching the web app';

create table if not exists public.issued_quotes (
  id text primary key,
  customer text not null default '',
  total_display text not null default '',
  quote_date date not null default (current_date),
  created_at timestamptz not null default now()
);

create index if not exists idx_issued_quotes_quote_date on public.issued_quotes (quote_date desc);

alter table public.issued_quotes enable row level security;

create policy "issued_quotes_allow_all"
on public.issued_quotes
for all
using (true)
with check (true);

create table if not exists public.pinned_template_ids (
  template_id integer primary key
);

alter table public.pinned_template_ids enable row level security;

create policy "pinned_template_ids_allow_all"
on public.pinned_template_ids
for all
using (true)
with check (true);

comment on table public.pinned_template_ids is 'Template ids pinned on the dispatch board (feed tab Pinned)';
