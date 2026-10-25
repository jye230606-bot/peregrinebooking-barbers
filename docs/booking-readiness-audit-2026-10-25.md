# V Barbers booking readiness — 25 October 2026

Core operational checks pass. Performance and concurrency fixes are deployed.
Final owner acceptance and email delivery still need a live booking cycle with
Vance's own sign-in before an unconditional go-live sign-off.

## Where Vance goes

- Customer bookings: https://vbarbers.peregrinepartners.space/
- Owner diary: https://www.peregrineoffice.space/console/shop/vbarbers
- The booking site's old `/owner` bookmark now redirects to that diary. It
  previously displayed a missing-password-configuration error for an obsolete
  standalone owner console.

Vance's Office account is confirmed, has a password, is not banned, has owner
membership of V Barbers, and had a successful sign-in on 24 October. Browser
testing in this session used the existing Peacock account; its inability to
open V Barbers is expected tenant isolation, not evidence of Vance's access.

## Changes released

1. Office's shop data functions now share one verified session and shop lookup
   within each React server render. An RSC regression test reproduced five
   auth checks and two tenant reads for the calendar before the fix; after the
   fix it performs one of each. Separate requests still authenticate again;
   a second user and sign-out were tested. This is request memoization, not
   shared caching of private diaries.
2. Shop routes have a loading state for navigation feedback.
3. A database trigger now serializes confirmed bookings and time-block writes
   for the same tenant, checking conflicts after taking the transaction lock.
   Previously a direct write could confirm a booking inside blocked time; the
   application precheck could also race with the other app. Two concurrent
   database tests verified both winning orders: the booking commits and the
   block is refused, or the block commits and the booking is refused.
4. The owner's time choices now include the booking buffer when checking
   blocked time. The public API and Office return a usable conflict response
   when another appointment wins a race against a new block.
5. Old `/owner` links go to Office rather than the retired sign-in screen.

## Verification

| Check | Result |
| --- | --- |
| V Barbers automated suite | 61 passed |
| Office automated suite | 83 passed |
| Both TypeScript checks | Passed after generating route types |
| Both Cloudflare production builds | Passed |
| Both Cloudflare deployment dry runs | Passed |
| Live public booking UI | Service, date, availability, taken times and details form checked |
| Live API privacy | Availability exposes only date, service ID and free starts; no-store |
| Live access controls | Signed-out diary redirects to sign-in; invalid manage tokens and calendar-feed secrets return 404 |
| Database member access | Member reads the shop, services and bookings |
| Database isolation | Unrelated authenticated user reads zero shops, bookings or customers |
| Database row security | Enabled on every V Barbers table |
| Database conflict checks | Block/booking overlap, buffer, touching boundaries, moving, cancellation and restoration passed |
| Concurrent database writes | Both booking-first and block-first races passed |
| Member writes after trigger | Authenticated member can still add a time block |
| Fixture cleanup | Zero audit tenants remain; existing real bookings unchanged |

SQL regression checks are in `tests/sql/diary-conflicts.sql`; their fixtures
roll back. The two concurrent tests used a separate disposable tenant and were
cleaned up. No customer or owner test emails were sent.

The existing `npm run store:check` integration script could not run because
the local environment has no Supabase service key. The live SQL checks above
were performed through the connected Supabase tool instead; they do not
replace a customer HTTP booking plus email-delivery test.

## Performance and Cloudflare

Both public domains are served by Cloudflare Workers. Supabase remains the
durable store in Sydney. Moving hosting did not remove repeated application
authentication/database calls; the render fix addresses those calls directly.

Three final post-release public availability requests took 94, 81 and 146 ms from
this machine. These are small synthetic samples, not a mobile benchmark or a
measurement of Vance's authenticated diary. No pre-migration comparison or
field Core Web Vitals trace was collected, so no hosting speed-up percentage
is claimed.

Reference: [Cloudflare placement](https://developers.cloudflare.com/workers/configuration/placement/)
explains how execution location and backend round trips affect latency.
The conflict trigger relies on the verified PostgREST READ COMMITTED isolation
and a VOLATILE function taking a fresh snapshot after the lock; see
[PostgreSQL function volatility](https://www.postgresql.org/docs/17/xfunc-volatility.html).

## Current shop settings

The database currently offers Haircut ($50, 45 minutes) and Haircut + beard
($60, 60 minutes), with starts every 30 minutes, zero buffer, two hours' notice,
21 days ahead, and a 12-hour guest-change cutoff. Tuesday–Friday hours are
10:00–18:15, Saturday 11:00–18:00. Sundays, Mondays and 5–9 November are closed.
The 30-minute start interval differs from the code fallback's 45 minutes;
the owner's database setting was preserved.

## Remaining acceptance check

Using Vance's own sign-in and phone:

1. Book a real available appointment from the public site.
2. Confirm it appears in his Office diary and the time disappears publicly.
3. Verify the guest confirmation and owner alert arrive, with correct time,
   address and working management links.
4. Move or cancel the appointment and verify both diary and notifications.
5. Try day/week navigation and adding a manual booking/block on his phone.

Email bindings and sender settings are configured on both Workers, but inbox
delivery and Vance's device responsiveness have not been signed off.

## Releases and rollback

- V Barbers Worker: `7351ad4a-55db-4ed8-a15a-42b6ca13a864`.
- Office Worker: `cc814e07-c104-4d90-a86f-c7f7de734521`.
- Database migration: `20261025094208_enforce_booking_block_conflicts.sql`.
- Office source changes are saved in the sibling `Peregrine Office-cf` repo.
  Session changes are recorded in local Git commits in both repositories;
  the releases were published directly through Wrangler.

The migration preserves existing data and adds only a function and two triggers.
Its rollback is the SQL below. This reopens the block/booking race and should
only be used to recover from a demonstrated problem with the trigger.

```sql
drop trigger bookings_check_time_blocks on vbarbers.bookings;
drop trigger blocks_check_appointments on vbarbers.blocks;
drop function vbarbers.check_booking_block_conflict();
```

The advisory lock strategy is verified at READ COMMITTED, the current API
isolation. A future writer changing transaction isolation must revisit that
guarantee. Existing shared-project advisor notices (including unindexed
foreign keys and pre-existing membership-helper/auth warnings) were reviewed;
no new advisor finding targeted this trigger. Unrelated Peacock settings were
left alone.
