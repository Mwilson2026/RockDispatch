-- Link each scale ticket to the same order-line fields used on daily orders (customer, job, tons ordered, loads, status).

alter table public.scale_tickets
  add column if not exists customer text not null default '',
  add column if not exists job text not null default '',
  add column if not exists tons_ordered numeric not null default 0,
  add column if not exists loads int not null default 0,
  add column if not exists status text not null default 'Scheduled';

comment on column public.scale_tickets.customer is 'Customer for this load (same concept as daily_orders.customer).';
comment on column public.scale_tickets.tons_ordered is 'Contract / ordered tons (scale net_tons is actual weight).';
