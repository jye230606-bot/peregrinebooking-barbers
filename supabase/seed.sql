-- V Barbers — seed data from Vance's Booksy page (vbarbersz), 19 October 2026.
--
-- Idempotent: every row has a fixed id or natural key and upserts, so it can
-- run again safely. It only ever touches the 'vbarbers' tenant's rows. The
-- same values live in src/config/tenant.ts and src/content/reviews.ts; a test
-- keeps them in step. Reviews are verbatim — never edit them.

begin;

insert into vbarbers.tenants (slug, name, timezone)
values ('vbarbers', 'V Barbers', 'Australia/Melbourne')
on conflict (slug) do update set name = excluded.name, timezone = excluded.timezone;

-- Services
insert into vbarbers.services (id, tenant_id, name, duration_min, price_cents, active, sort)
select v.id::uuid, t.id, v.name, v.duration_min, v.price_cents, true, v.sort
from vbarbers.tenants t,
  (values
    ('74cdb172-7b61-5260-9f17-9e6d24c2e17d', 'Haircut', 45, 5000, 1),
    ('25ff47d7-538d-59d3-85ae-02c77364f6c2', 'Haircut + beard', 60, 6000, 2)
  ) as v (id, name, duration_min, price_cents, sort)
where t.slug = 'vbarbers'
on conflict (id) do update set name = excluded.name, duration_min = excluded.duration_min,
  price_cents = excluded.price_cents, active = excluded.active, sort = excluded.sort;

-- Weekly hours, Australia/Melbourne. Sunday (0) and Monday (1) closed: no rows.
insert into vbarbers.weekly_hours (id, tenant_id, weekday, open_local, close_local)
select v.id::uuid, t.id, v.weekday, v.open_local::time, v.close_local::time
from vbarbers.tenants t,
  (values
    ('ce04366e-d279-58a6-9a45-4c0e70820bd7', 2, '10:00', '18:15'),
    ('e5135264-9636-5a71-b6cb-e4d8dd3c2376', 3, '10:00', '18:15'),
    ('b2e6bc2c-6007-5aae-85ab-56b3ee994c95', 4, '10:00', '18:15'),
    ('d61953cd-9acb-57d1-8565-fd9d311a953a', 5, '10:00', '18:15'),
    ('24ab9bc9-4b50-5133-bf7b-7833fb736332', 6, '11:00', '18:00')
  ) as v (id, weekday, open_local, close_local)
where t.slug = 'vbarbers'
on conflict (id) do update set weekday = excluded.weekday, open_local = excluded.open_local,
  close_local = excluded.close_local;

-- Date overrides: closed 5–9 November 2026.
insert into vbarbers.date_overrides (tenant_id, date, closed, note)
select t.id, d::date, true, null
from vbarbers.tenants t, unnest(array['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09']) as d
where t.slug = 'vbarbers'
on conflict (tenant_id, date) do update set closed = true, open_local = null, close_local = null;

-- Reviews: all 16 from Booksy, verbatim. 5.0 from 16, all with Vance.
insert into vbarbers.reviews (id, tenant_id, author_name, rating, body, service_name, reviewed_on, source)
select v.id::uuid, t.id, v.author_name, 5, v.body, v.service_name, v.reviewed_on::date, 'booksy'
from vbarbers.tenants t,
  (values
    ('8ff6a0d2-cba8-592b-9fe1-3fe1b12c3ba4', 'Jason', null, 'Haircut', '2026-09-30'),
    ('7de5e0a7-2839-5044-a075-a22cb2fabe41', 'James', null, 'Haircut', '2026-09-28'),
    ('5c9c0b08-e510-54d9-99ba-f02c6de66138', 'xavier', 'Vbarbers has been my barber for many years now. I don’t normally leave reviews but his attention to details, skils and cognitive ability to understand his customers needs leaves me satisfied everytime. Thank you Vance.', 'Haircut', '2026-09-24'),
    ('27f36974-f38e-55a2-8140-5e38876887ae', 'Ethan', null, 'Haircut', '2026-09-12'),
    ('e81de458-3448-57e1-9c56-ccd6ae53da41', 'kai', 'cleaned up my clapped head,', 'Haircut', '2026-08-26'),
    ('3cf13903-77fc-50e7-8df1-074d33953104', 'Will', '10/10', 'Haircut', '2026-08-21'),
    ('bced4d22-8189-5872-aebc-b571271dede7', 'James', 'Most ripper trim in world', 'Haircut', '2026-08-10'),
    ('d6a40e67-85f8-5524-9258-81ae9a9c255b', 'Jason', 'Unbelievable haircut, can’t remember the last time I was this happy w a haircut.', 'Haircut', '2026-05-29'),
    ('6965cc67-c2dd-5e4f-a569-85e822e3e18b', 'Oliver', 'Great cut. Definitely be going again.', 'Haircut', '2026-03-03'),
    ('79e67c84-b09e-5f97-bc5e-01e0da4eeb23', 'xavier', 'Best barber i’ve been too', 'Haircut', '2026-01-22'),
    ('55e94139-2bef-51e5-bcf2-e4ccb2344cef', 'Isaac', 'Couldn’t get girls to leave me alone 10/10', 'Haircut', '2025-12-17'),
    ('91312965-668e-5727-b8ac-0603d23781b9', 'Jack', 'The best of the best', 'Haircut', '2025-12-03'),
    ('9c97e87d-8b1a-5621-8a39-1a4ce815421a', 'Charles', 'high skilled barber and great dude, will definitely be returning', 'Haircut', '2025-11-25'),
    ('46d3c9db-3c69-56b8-b9c8-1a4fed0250a4', 'Pranay', 'Best barber', 'Haircut', '2025-10-14'),
    ('d1f0da26-2856-56ba-bf57-41c12f14c3bf', 'Joanne', 'Superb haircut and fixed up my beard real nice 🔥🔥🔥', 'Haircut + beard', '2025-08-27'),
    ('662350d5-4264-50b3-a562-ce88f60b3e74', 'Luca', 'Great barber', 'Haircut', '2025-08-02')
  ) as v (id, author_name, body, service_name, reviewed_on)
where t.slug = 'vbarbers'
on conflict (id) do nothing;

-- Booking rules (editable by Vance in the console from here on).
update vbarbers.tenants
set slot_minutes = 45, buffer_minutes = 0, min_notice_minutes = 120,
    max_advance_days = 21, guest_change_cutoff_hours = 12
where slug = 'vbarbers';

commit;
