-- V Barbers booking — Peregrine's shared, multi-tenant Supabase.
--
-- Additive only. Every table is new and carries tenant_id; nothing existing is
-- dropped, altered or renamed. Plain CREATE TABLE (no IF NOT EXISTS) on
-- purpose: if a table of the same name is already there, this fails loudly
-- instead of silently leaving a different shape in place.
--
-- Row-level security is on everywhere with no policies: deny-all for anon and
-- authenticated. Only the service role (server-side, never in a browser)
-- reads or writes. Policies for the Peregrine portal come later.

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        text not null,
  timezone    text not null default 'Australia/Melbourne',
  created_at  timestamptz not null default now()
);

create table public.services (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id),
  name          text not null,
  duration_min  int not null check (duration_min > 0),
  price_cents   int not null check (price_cents >= 0),
  active        boolean not null default true,
  sort          int not null default 0,
  unique (tenant_id, id)
);

create table public.weekly_hours (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id),
  weekday      smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  open_local   time not null,
  close_local  time not null,
  check (close_local > open_local)
);

create table public.date_overrides (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id),
  date         date not null,
  closed       boolean not null default true,
  open_local   time,
  close_local  time,
  note         text,
  unique (tenant_id, date),
  check (closed or (open_local is not null and close_local is not null and close_local > open_local))
);

create table public.blocks (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text,
  check (ends_at > starts_at)
);

-- One customer per phone per tenant; bookings upsert on (tenant_id, phone).
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id),
  name        text not null,
  phone       text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'), -- E.164
  email       text,
  notes       text,
  source      text not null default 'web',
  created_at  timestamptz not null default now(),
  unique (tenant_id, phone),
  unique (tenant_id, id)
);

create table public.bookings (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id),
  service_id            uuid not null,
  customer_id           uuid not null,
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  blocked_until         timestamptz not null, -- ends_at + buffer
  status                text not null default 'confirmed'
                          check (status in ('confirmed', 'cancelled', 'completed', 'no_show')),
  price_cents_snapshot  int not null check (price_cents_snapshot >= 0),
  notes                 text,
  source                text not null default 'web' check (source in ('web', 'owner')),
  manage_token_hash     text, -- SHA-256 hex of the guest's token; never the token
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  cancelled_at          timestamptz,
  check (ends_at > starts_at),
  check (blocked_until >= ends_at),
  -- A booking's service and customer must belong to the same tenant as it does.
  foreign key (tenant_id, service_id) references public.services (tenant_id, id),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id),
  -- The final word on double booking: no two confirmed bookings for a tenant
  -- may overlap, whichever door the write came through.
  constraint bookings_no_overlap exclude using gist (
    tenant_id with =,
    tstzrange(starts_at, blocked_until) with &&
  ) where (status = 'confirmed')
);

create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id),
  author_name   text not null,
  rating        smallint not null check (rating between 1 and 5),
  body          text,
  service_name  text,
  reviewed_on   date not null,
  source        text not null check (source in ('booksy', 'google', 'web'))
);

create index bookings_tenant_starts_idx on public.bookings (tenant_id, starts_at);
create index bookings_customer_idx on public.bookings (customer_id);
create index blocks_tenant_starts_idx on public.blocks (tenant_id, starts_at);
create index services_tenant_idx on public.services (tenant_id);
create index weekly_hours_tenant_idx on public.weekly_hours (tenant_id);
create index reviews_tenant_idx on public.reviews (tenant_id, reviewed_on desc);

alter table public.tenants        enable row level security;
alter table public.services       enable row level security;
alter table public.weekly_hours   enable row level security;
alter table public.date_overrides enable row level security;
alter table public.blocks         enable row level security;
alter table public.customers      enable row level security;
alter table public.bookings       enable row level security;
alter table public.reviews        enable row level security;
