-- V Barbers in the PeregrineOffice console: who may manage the shop, the
-- booking rules Vance can change, and the row-level security that lets a
-- signed-in member (and nobody else) read and write the shop's diary.
--
-- Additive only. The public booking page keeps using the service role, which
-- bypasses RLS, so guests booking a cut are unaffected. Two-step sign-in is
-- optional for shop owners, so these policies ask for membership, not aal2;
-- the console sends anyone who has turned two-step on through it.

-- --- booking rules, editable from the console ---------------------------------

alter table vbarbers.tenants
  add column slot_minutes int not null default 45 check (slot_minutes in (15, 30, 45, 60)),
  add column buffer_minutes int not null default 0 check (buffer_minutes between 0 and 60),
  add column min_notice_minutes int not null default 120 check (min_notice_minutes between 0 and 2880),
  add column max_advance_days int not null default 21 check (max_advance_days between 1 and 180),
  add column guest_change_cutoff_hours int not null default 12 check (guest_change_cutoff_hours between 0 and 168);

-- --- members ---------------------------------------------------------------------

create table vbarbers.members (
  tenant_id   uuid not null references vbarbers.tenants (id),
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner', 'staff')),
  created_at  timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index members_user_idx on vbarbers.members (user_id);

alter table vbarbers.members enable row level security;

-- Security definer so policies on members itself don't recurse.
create function vbarbers.is_member(t uuid) returns boolean
  language sql stable security definer
  set search_path = pg_catalog, vbarbers
as $$
  select exists (select 1 from vbarbers.members m where m.tenant_id = t and m.user_id = auth.uid())
$$;

revoke all on function vbarbers.is_member(uuid) from public, anon;
grant execute on function vbarbers.is_member(uuid) to authenticated, service_role;

-- --- weekly hours, replaced in one go ----------------------------------------------

-- days: [{"weekday": 2, "open": "10:00", "close": "18:15"}, …]. A weekday that
-- isn't listed is closed. Runs as the caller, so RLS still applies, and as one
-- statement, so a dropped connection can't leave the shop with no hours.
create function vbarbers.set_weekly_hours(t uuid, days jsonb) returns void
  language plpgsql security invoker
  set search_path = pg_catalog, vbarbers
as $$
begin
  if not vbarbers.is_member(t) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  delete from vbarbers.weekly_hours where tenant_id = t;
  insert into vbarbers.weekly_hours (tenant_id, weekday, open_local, close_local)
  select t, (d ->> 'weekday')::smallint, (d ->> 'open')::time, (d ->> 'close')::time
  from jsonb_array_elements(days) d;
end
$$;

revoke all on function vbarbers.set_weekly_hours(uuid, jsonb) from public, anon;
grant execute on function vbarbers.set_weekly_hours(uuid, jsonb) to authenticated;

-- --- grants: members only ever get what their policies allow --------------------

grant usage on schema vbarbers to authenticated;
grant select on vbarbers.tenants, vbarbers.reviews, vbarbers.members to authenticated;
grant update (slot_minutes, buffer_minutes, min_notice_minutes, max_advance_days, guest_change_cutoff_hours)
  on vbarbers.tenants to authenticated;
grant select, insert, update, delete
  on vbarbers.services, vbarbers.weekly_hours, vbarbers.date_overrides, vbarbers.blocks to authenticated;
grant select, insert, update on vbarbers.customers, vbarbers.bookings to authenticated;

-- --- policies ------------------------------------------------------------------------

create policy "members read their shop" on vbarbers.tenants
  for select to authenticated using (vbarbers.is_member(id));
create policy "members change their shop's rules" on vbarbers.tenants
  for update to authenticated using (vbarbers.is_member(id)) with check (vbarbers.is_member(id));

create policy "members see their own membership" on vbarbers.members
  for select to authenticated using (user_id = auth.uid() or vbarbers.is_member(tenant_id));

create policy "members manage services" on vbarbers.services
  for all to authenticated using (vbarbers.is_member(tenant_id)) with check (vbarbers.is_member(tenant_id));
create policy "members manage hours" on vbarbers.weekly_hours
  for all to authenticated using (vbarbers.is_member(tenant_id)) with check (vbarbers.is_member(tenant_id));
create policy "members manage time off" on vbarbers.date_overrides
  for all to authenticated using (vbarbers.is_member(tenant_id)) with check (vbarbers.is_member(tenant_id));
create policy "members manage blocks" on vbarbers.blocks
  for all to authenticated using (vbarbers.is_member(tenant_id)) with check (vbarbers.is_member(tenant_id));

create policy "members read clients" on vbarbers.customers
  for select to authenticated using (vbarbers.is_member(tenant_id));
create policy "members add clients" on vbarbers.customers
  for insert to authenticated with check (vbarbers.is_member(tenant_id));
create policy "members update clients" on vbarbers.customers
  for update to authenticated using (vbarbers.is_member(tenant_id)) with check (vbarbers.is_member(tenant_id));

create policy "members read bookings" on vbarbers.bookings
  for select to authenticated using (vbarbers.is_member(tenant_id));
create policy "members add bookings" on vbarbers.bookings
  for insert to authenticated with check (vbarbers.is_member(tenant_id));
create policy "members change bookings" on vbarbers.bookings
  for update to authenticated using (vbarbers.is_member(tenant_id)) with check (vbarbers.is_member(tenant_id));

create policy "members read reviews" on vbarbers.reviews
  for select to authenticated using (vbarbers.is_member(tenant_id));

-- --- live updates in the console ---------------------------------------------------

alter publication supabase_realtime add table vbarbers.bookings, vbarbers.blocks;
