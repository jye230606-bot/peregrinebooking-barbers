-- Bookings and time blocks must share a transaction lock. App prechecks alone
-- can race across the public booking site and the owner's Office console.
-- No row data changes. Existing readers and writers keep the same contracts.
-- Rollback instructions live in docs/booking-readiness-audit-2026-10-25.md.
create function vbarbers.check_booking_block_conflict() returns trigger
  language plpgsql volatile security invoker
  set search_path = pg_catalog, vbarbers
as $$
begin
  if tg_table_name = 'bookings' then
    if new.status <> 'confirmed' then return new; end if;
  end if;

  -- PostgREST writes run at READ COMMITTED. The VOLATILE function's query
  -- after this lock takes a fresh snapshot, including a competing commit.
  perform pg_advisory_xact_lock(hashtextextended('vbarbers.diary:' || new.tenant_id::text, 0));

  if tg_table_name = 'bookings' then
    if exists (
      select 1 from vbarbers.blocks k
      where k.tenant_id = new.tenant_id
        and k.starts_at < new.blocked_until and k.ends_at > new.starts_at
    ) then
      raise exception 'That time is blocked.' using errcode = '23P01', constraint = 'bookings_blocks_no_overlap';
    end if;
  else
    if exists (
      select 1 from vbarbers.bookings b
      where b.tenant_id = new.tenant_id and b.status = 'confirmed'
        and b.starts_at < new.ends_at and b.blocked_until > new.starts_at
    ) then
      raise exception 'An appointment holds that time.' using errcode = '23P01', constraint = 'bookings_blocks_no_overlap';
    end if;
  end if;
  return new;
end
$$;

revoke all on function vbarbers.check_booking_block_conflict() from public, anon;
grant execute on function vbarbers.check_booking_block_conflict() to authenticated, service_role;

create trigger bookings_check_time_blocks
  before insert or update of tenant_id, starts_at, ends_at, blocked_until, status
  on vbarbers.bookings for each row execute function vbarbers.check_booking_block_conflict();
create trigger blocks_check_appointments
  before insert or update of tenant_id, starts_at, ends_at
  on vbarbers.blocks for each row execute function vbarbers.check_booking_block_conflict();
