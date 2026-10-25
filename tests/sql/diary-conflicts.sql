-- Run against the shared database. All fixtures roll back; no messages send.
begin;
do $$
declare
  t uuid;
  s uuid;
  c uuid;
  b uuid;
  refused boolean;
begin
  insert into vbarbers.tenants(slug,name)
    values('vbarbers-conflict-audit-' || substr(gen_random_uuid()::text,1,8),'Disposable conflict audit') returning id into t;
  insert into vbarbers.services(tenant_id,name,duration_min,price_cents)
    values(t,'Audit',45,0) returning id into s;
  insert into vbarbers.customers(tenant_id,name,phone)
    values(t,'Audit','+61400000001') returning id into c;
  insert into vbarbers.blocks(tenant_id,starts_at,ends_at)
    values(t,'2030-01-15T00:00:00Z','2030-01-15T01:00:00Z');

  refused := false;
  begin
    insert into vbarbers.bookings(tenant_id,service_id,customer_id,starts_at,ends_at,blocked_until,price_cents_snapshot)
      values(t,s,c,'2030-01-15T00:00:00Z','2030-01-15T00:45:00Z','2030-01-15T00:45:00Z',0);
  exception when exclusion_violation then refused := true;
  end;
  if not refused then raise exception 'Database accepted a booking inside blocked time'; end if;

  -- Exact boundaries may touch. A booking's buffer is held too.
  insert into vbarbers.bookings(tenant_id,service_id,customer_id,starts_at,ends_at,blocked_until,price_cents_snapshot)
    values(t,s,c,'2030-01-15T01:00:00Z','2030-01-15T01:45:00Z','2030-01-15T02:00:00Z',0) returning id into b;
  refused := false;
  begin
    insert into vbarbers.blocks(tenant_id,starts_at,ends_at)
      values(t,'2030-01-15T01:45:00Z','2030-01-15T02:00:00Z');
  exception when exclusion_violation then refused := true;
  end;
  if not refused then raise exception 'Database accepted a block over a booking buffer'; end if;

  refused := false;
  begin
    update vbarbers.bookings set starts_at='2030-01-15T00:00:00Z',ends_at='2030-01-15T00:45:00Z',blocked_until='2030-01-15T00:45:00Z' where id=b;
  exception when exclusion_violation then refused := true;
  end;
  if not refused then raise exception 'Database moved a booking into blocked time'; end if;

  update vbarbers.bookings set status='cancelled' where id=b;
  insert into vbarbers.blocks(tenant_id,starts_at,ends_at)
    values(t,'2030-01-15T01:00:00Z','2030-01-15T02:00:00Z');
  refused := false;
  begin
    update vbarbers.bookings set status='confirmed' where id=b;
  exception when exclusion_violation then refused := true;
  end;
  if not refused then raise exception 'Database restored a booking into blocked time'; end if;
end
$$;
rollback;
select 'booking/block conflicts, buffer, touching boundaries, move, cancellation and restore passed' as result;
