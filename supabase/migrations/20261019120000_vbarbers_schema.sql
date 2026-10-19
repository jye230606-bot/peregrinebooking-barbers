-- V Barbers booking — Peregrine's shared, multi-tenant Supabase.
--
-- Everything lives in its own `vbarbers` schema, so it can't collide with the
-- restaurant tables in `public` (which already has a `bookings`). PostgREST
-- must expose the schema (API settings → exposed schemas), and the store sends
-- Accept-Profile / Content-Profile: vbarbers on every call.
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

create schema vbarbers;

create table vbarbers.tenants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        text not null,
  timezone    text not null default 'Australia/Melbourne',
  created_at  timestamptz not null default now()
);

create table vbarbers.services (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references vbarbers.tenants (id),
  name          text not null,
  duration_min  int not null check (duration_min > 0),
  price_cents   int not null check (price_cents >= 0),
  active        boolean not null default true,
  sort          int not null default 0,
  unique (tenant_id, id)
);

create table vbarbers.weekly_hours (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references vbarbers.tenants (id),
  weekday      smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  open_local   time not null,
  close_local  time not null,
  check (close_local > open_local)
);

create table vbarbers.date_overrides (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references vbarbers.tenants (id),
  date         date not null,
  closed       boolean not null default true,
  open_local   time,
  close_local  time,
  note         text,
  unique (tenant_id, date),
  check (closed or (open_local is not null and close_local is not null and close_local > open_local))
);

create table vbarbers.blocks (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references vbarbers.tenants (id),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text,
  check (ends_at > starts_at)
);

-- One customer per phone per tenant; bookings upsert on (tenant_id, phone).
create table vbarbers.customers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references vbarbers.tenants (id),
  name        text not null,
  phone       text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'), -- E.164
  email       text,
  notes       text,
  source      text not null default 'web',
  created_at  timestamptz not null default now(),
  unique (tenant_id, phone),
  unique (tenant_id, id)
);

create table vbarbers.bookings (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references vbarbers.tenants (id),
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
  foreign key (tenant_id, service_id) references vbarbers.services (tenant_id, id),
  foreign key (tenant_id, customer_id) references vbarbers.customers (tenant_id, id),
  -- The final word on double booking: no two confirmed bookings for a tenant
  -- may overlap, whichever door the write came through.
  constraint bookings_no_overlap exclude using gist (
    tenant_id with =,
    tstzrange(starts_at, blocked_until) with &&
  ) where (status = 'confirmed')
);

create table vbarbers.reviews (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references vbarbers.tenants (id),
  author_name   text not null,
  rating        smallint not null check (rating between 1 and 5),
  body          text,
  service_name  text,
  reviewed_on   date not null,
  source        text not null check (source in ('booksy', 'google', 'web'))
);

create index bookings_tenant_starts_idx on vbarbers.bookings (tenant_id, starts_at);
create index bookings_customer_idx on vbarbers.bookings (customer_id);
create index blocks_tenant_starts_idx on vbarbers.blocks (tenant_id, starts_at);
create index services_tenant_idx on vbarbers.services (tenant_id);
create index weekly_hours_tenant_idx on vbarbers.weekly_hours (tenant_id);
create index reviews_tenant_idx on vbarbers.reviews (tenant_id, reviewed_on desc);

alter table vbarbers.tenants        enable row level security;
alter table vbarbers.services       enable row level security;
alter table vbarbers.weekly_hours   enable row level security;
alter table vbarbers.date_overrides enable row level security;
alter table vbarbers.blocks         enable row level security;
alter table vbarbers.customers      enable row level security;
alter table vbarbers.bookings       enable row level security;
alter table vbarbers.reviews        enable row level security;

-- Only the service role reaches the schema. anon and authenticated get nothing,
-- on top of RLS being deny-all.
grant usage on schema vbarbers to service_role;
grant all on all tables in schema vbarbers to service_role;
alter default privileges in schema vbarbers grant all on tables to service_role;
