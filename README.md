# V Barbers booking

Customer booking site for V Barbers, Hampton East. Customers choose a service
and time, book, and manage their appointment through a private link. Vance
manages the same diary through Peregrine Office.

## Live links

| Purpose | URL |
| --- | --- |
| Customer bookings | https://vbarbers.peregrineoffice.space/ |
| Vance's diary | https://www.peregrineoffice.space/console/shop/vbarbers |
| Design review (bookings disabled) | https://vbarbers-design-review-20261026.peregrine-office.workers.dev/ |

The booking site's `/owner` route redirects to Office. Vance uses his Office
account; the old standalone owner password screen is retired.

The customer address moved to `vbarbers.peregrineoffice.space` on 26 October
2026. The earlier `vbarbers.peregrinepartners.space` address remains available
for existing links. New booking emails use the Office booking address.

## Mobile booking fix — 28 October 2026

The initial fix did not resolve the user's report. The
[overlay follow-up](docs/booking-overlay-follow-up-2026-10-28.md) restores the
working reference's React overlay mechanism while retaining the current design,
with explicit opening commands and 74 passing tests.

The mobile booking controls now retain a first tap while the booking view
loads. Intro interaction and scroll locking, modal close recovery, and
availability retry handling have been corrected. The production fix passed
71 tests and browser checks at 320, 390 and 430 px widths. Dependency security
patches are included; npm audit reports zero known vulnerabilities. Physical
phone and inbox acceptance remain unverified. See the
[mobile audit and release record](docs/mobile-booking-audit-2026-10-28.md).

## Approved design release — 27 October 2026

Vance approved the design. The blue preface, bottom-up page transitions and
original rounded booking controls are now live on the Office booking address.
Production bookings are enabled. The separate review link still has submissions
disabled. See the [release record](docs/release-2026-10-27.md) for verification
and production/previous version IDs.

## Historical handoff — 26 October 2026

The Office booking domain and clipper removal are live. The blue preface and
bottom-up transition were initially published at the design review link, with
booking submissions disabled there. That review was subsequently approved and
released to production on 27 October; see the release record above.

See the [session handoff](docs/session-handoff-2026-10-26.md) for release IDs,
verification, source state and durable preview recovery files.

## Previous handoff — 25 October 2026

Performance and booking-safety fixes are live. Core checks pass; final owner
acceptance and inbox delivery still need a live booking cycle with Vance.

- Office calendar reads share one verified session and shop lookup per server
  render: five authentication checks became one, and two shop reads became
  one. Each new request authenticates separately.
- Shop navigation shows a loading state.
- The database now prevents a booking and a time block from winning the same
  time concurrently. Both transaction orders were tested.
- Appointment buffers are respected when checking blocked time, and raced
  block writes return a clear conflict.
- Old owner bookmarks lead to the Office diary.

Verification completed: **61 booking-site tests and 83 Office tests**, both
TypeScript checks, both Cloudflare builds, live route/access checks, database
tenant isolation and database conflict tests. Disposable database fixtures
were cleaned up; existing bookings were preserved.

Next session: use Vance's own sign-in and phone to make a booking, confirm it
appears in his diary, verify guest and owner emails, then move or cancel it.
Check diary navigation on his phone as part of that cycle. Email bindings are
configured; inbox delivery and his device's responsiveness remain unverified.

See the [full readiness audit](docs/booking-readiness-audit-2026-10-25.md) for
measurements, release versions, database checks, limitations and rollback.

## Architecture and ownership

- Next.js App Router and React, built with vinext/Vite for Cloudflare Workers.
- Cloudflare Worker: `vbarbers`, configured in `wrangler.jsonc`.
- Supabase: shared `Peregrine office - Clients` project, Sydney region;
  V Barbers data lives in the `vbarbers` schema.
- The customer API uses a server-only service key. Office uses the signed-in
  member's session and database row-level security.
- Production email uses the Cloudflare `EMAIL` binding. Resend remains an
  alternative outside Workers.
- Owner UI source lives in the sibling `../../Peregrine Office-cf` repository.
  Diary changes there require a separate Office Worker deployment.

Services, opening hours, time off and booking rules in Supabase are the live
source of truth. `src/config/tenant.ts` supplies branding and fallback values.
The current 30-minute start interval differs from the fallback's 45 minutes;
preserve Vance's database settings unless he requests a change.

## Local development

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Use `STORE=file` for local development with a disposable diary under `.data/`.
For Supabase development, set `STORE=supabase`, `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` in the ignored local environment file. That can
reach real data: check the tenant before running any write or seed command.
Never expose the service key through a `NEXT_PUBLIC_` variable.

The Worker path is available with `npm run dev:vinext` on port 3001. Its
Cloudflare bindings and environment come from the Wrangler/Vite setup; keep
local credentials in ignored files.

## Checks and deployment

```sh
npm test
npm run build:vinext
npx next typegen
npx tsc --noEmit
git diff --check
```

Run type generation after the vinext build: both toolchains write route types
under `.next/`, and concurrent generation can produce incompatible files.

Production uses the Cloudflare scripts:

```sh
npm run deploy:vinext
```

This builds and deploys the existing Worker. The `build`/`start` scripts are
the Next.js path, while `build:vinext`/`deploy:vinext` target Cloudflare.
Worker secrets are managed separately from the non-secret vars in
`wrangler.jsonc`; local `.env.local` values are not uploaded automatically.

`npm run store:check` exercises real Supabase persistence, concurrent booking
inserts and optional member access under its own self-test tenant. It needs
the service credentials described in the script and cleans up its fixtures.
It could not run in the audit session because the local service key was
absent; live SQL checks were run through the connected Supabase tool instead.

Database migrations live in `supabase/migrations/`. The applied conflict fix
is `20261025094208_enforce_booking_block_conflicts.sql`; its SQL regression
check is [tests/sql/diary-conflicts.sql](tests/sql/diary-conflicts.sql). The
transaction-lock strategy was verified at the current READ COMMITTED API
isolation. Revisit that guarantee before introducing a writer with different
transaction isolation.

Read `AGENTS.md` and the relevant installed guides under
`node_modules/next/dist/docs/` before changing Next.js code.
