# Session handoff — 26 October 2026

**Superseded status:** Vance approved the design and it was published to the
live Office subdomain on 27 October. Start with the
[production release record](release-2026-10-27.md). The pending-publication
instructions below describe the earlier review state.

## Resume here

Wait for Vance's feedback on the public design review before making further
visual changes or publishing the transition to the live booking site.

- **Review:** https://vbarbers-design-review-20261026.peregrine-office.workers.dev/
- **Live bookings:** https://vbarbers.peregrineoffice.space/
- **Owner diary:** https://www.peregrineoffice.space/console/shop/vbarbers
- **Local development:** `npm run dev:vinext` (port 3001), if the server is no
  longer running. Its continued availability is not required for the review URL.

The review opens publicly without a login. Booking submissions are disabled.
Creating the review did not change the live deployment.

## Design direction selected

The user rejected the flat booking redesign and asked to keep the blue
preface, with a page slide from bottom to top.

- Blue screen with the black V Barbers mark for 600 ms.
- The complete landing page rises over the blue preface in a 600 ms slide.
- No liquid, droplets, rounded-edge morph or horizontal background movement.
- Preface plays once per tab session, can be skipped, and respects reduced motion.
  Open a fresh tab to review it again; refreshing an already-seen session skips it.
- Original rounded booking cards, palette and typography restored.
- Full-screen booking view also rises from below (420 ms); Back/Escape returns
  it downward (320 ms). Desktop has the heading beside the flow; mobile stacks it.
- Native dialog contains focus, locks background scrolling through the exit,
  and returns focus to the original booking button.
- Step scrolling leaves room for the fixed booking header.
- Confirmation checkmark uses ease-out rather than spring easing.

[Motion recording](previews/2026-10-26/blue-upward-slide.gif) ·
[Public review screenshot](previews/2026-10-26/public-review.jpg)

## What actually went live

Production Worker `vbarbers` is serving version
`e3bf1873-900f-481a-b7c6-d0175f72be5f` at 100%, verified when the review was published.
That release removed the clipper animation, its cover and guide, and its
waiting time. The hero booking button's blue edge and halo remain.

The primary public address moved from the Partners domain to
`vbarbers.peregrineoffice.space`. The earlier Partners route still works.
`SITE_URL` now generates new booking links on Office. The configured email
sender was not changed.

**The new blue preface and full-page transition are only on the review copy
and in local source. They are not on the live booking site.** Main source's
normal deploy command would publish these pending changes, so deploy only
when the user asks to release them after review.

No database migration, customer booking, email send, owner-account change,
Office deployment, Git push or PR merge was part of this session.

## Review deployment and recovery

- Separate Worker: `vbarbers-design-review-20261026`.
- Version: `1d27e527-d188-4287-a5c8-7dfa337d3c57`.
- Build source currently: `/tmp/vbarbers-design-review-20261026`.
- No production secrets, database credentials or email binding were deployed.
- Public shop settings are snapshotted from the rendered local page.
- Availability GET requests proxy the existing public live endpoint.
- Other reads use the isolated file store; booking POST/DELETE return 403 with
  a clear preview message. The review cannot create appointments or send mail.
- Snapshot settings can become stale; production's database remains authoritative.

Temporary directories may disappear. The exact review-only changes are saved
in [review-only.patch](previews/2026-10-26/review-only.patch). To recreate the
review, make a separate copy of this session's saved source, excluding `.git`,
`.env*`, `.vercel`, `.data`, `.next`, `.wrangler`, `dist` and `node_modules`.
Apply that patch **in the review copy** using `git apply --unidiff-zero`,
then install dependencies with `npm ci`
(or link the existing local `node_modules`), build with `npm run build:vinext`,
then run `npx wrangler deploy --dry-run` and `npx wrangler deploy` from that copy.
Before the upload, confirm the generated config names the review Worker,
contains no custom-domain routes, and lists only ASSETS and the file-store
variables. Do not apply the review patch to the production checkout.

## Verification completed

- Session-close automated suite: 61 tests passed.
- Main source and review copy TypeScript checks passed.
- Review Cloudflare production build and deployment dry run passed.
- Public review homepage, CSS and JavaScript returned HTTP 200 without auth.
- Public review availability returned HTTP 200 and no-store.
- Review booking POST and DELETE returned HTTP 403, preview code.
- Blue intro and upward handover checked in the browser.
- Desktop (1440 px) and mobile (390 px) layouts checked.
- Booking button, service/date step, repeat open, Back/Escape, scroll unlock
  and focus return checked; no real appointment was submitted.
- Impeccable detector passed for the changed UI after the easing fix.
- Git whitespace checks passed.

The remaining live owner acceptance and inbox-delivery cycle described in
[the 25 October audit](booking-readiness-audit-2026-10-25.md) is still outstanding.
Do that on the real booking site with Vance when authorized; the review copy
intentionally cannot complete a booking.

## Source and repository state

Work was performed on branch `cloudflare`, starting at `e83b1de`.
The session-close local commit contains the domain config, clipper removal,
transition prototype, documentation and durable preview artifacts.
`PICKUP.md` is deliberately excluded by `.git/info/exclude`; it is updated
locally and points here. No Git push was requested or performed.
