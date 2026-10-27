# Mobile booking audit — 28 October 2026

Vance and the user reported needing several taps, or a reload, to reach the
booking view on mobile. The customer booking fixes are live on both booking
domains. Physical iPhone Safari and Instagram's in-app browser still need a
device acceptance check; the browser checks below used Chrome at phone widths.

## Findings and fixes

| Finding | Evidence | Resolution |
| --- | --- | --- |
| An opening tap could disappear before the sheet mounted | A regression test clicked the actual booking control before mounting the sheet; the original event was lost | Both booking controls are native `#book` links. The URL retains the request before hydration, and the sheet reads it on mount and on hash changes |
| The visible booking control remained inert during the entrance | The original intro kept `main#booking` inert until the slide finished | Inert applies only during the hidden hold. Requesting booking finishes the intro immediately |
| Intro and dialog scroll locks could interfere | A regression reproduced the intro releasing the dialog's lock and the dialog restoring an obsolete intro lock | The intro is contained with local CSS; only the dialog changes the page's scroll lock |
| Missing exit animation events could strand the modal | Closing depended exclusively on `animationend` | A 450 ms cleanup fallback releases the modal, scroll lock and focus even without that event |
| Repeated open events reset the customer's selections | The old opening handler always remounted the flow | Opening is idempotent while the booking view is open |
| The main target shrank during a touch press | `:active` scaled the target, changing its bounds during a tap | The target stays still on touch devices and uses `touch-action: manipulation`; this is a touch interaction precaution, not a claim of a separately reproduced Safari defect |
| Network problems could leave loading running indefinitely | Browser API requests had no deadline | Requests now have a 30-second deadline and release the pending state. Timed-out writes tell customers to check their confirmation email before retrying |
| Failed availability could appear as an empty diary, with no retry | Both new-booking and rescheduling flows mapped failures to an empty times array | Errors are distinct from genuine unavailability and offer `Retry times` on the same date |
| Malformed successful API responses were treated as data | Failed JSON parsing silently became `{}` | Malformed responses produce a recoverable API error |
| Dependency advisories | Initial npm audit reported 10 affected packages, including critical and high findings | Next 16.4.3, Vite 8.3.5 and vinext 1.3.1; scoped overrides update satori's fflate to 0.7.5 and Miniflare's undici to 7.30.1. Final npm audit: zero known vulnerabilities |

These are confirmed code failure paths and preventive touch improvements.
The exact sequence on the reporting phones was not captured; a normal fresh
desktop click worked before the fix. The report does not attribute every
reported tap failure to one proven physical-device cause.

## Verification

- `npm test`: **71 passed**, including ten new component and browser API
  regression tests. Real React components run in Happy DOM; external network
  failures are simulated at the fetch boundary.
- `npm run build:vinext`: passed with the existing adapter sourcemap and
  ineffective-dynamic-import warnings.
- `npx next typegen`, `npx tsc --noEmit`, `git diff --check`: passed.
- `npx wrangler deploy --dry-run`: passed with production bindings and routes.
- `npm audit --json`: no known vulnerabilities across all installed packages.
- Live Chrome at **390 × 844**: first-click open plus five consecutive
  single-click open/Back/reopen cycles passed.
- Live Chrome at **320 × 740**: the lower booking link, browser Back and
  Forward passed.
- Live Chrome at **430 × 932**: haircut + beard → date → live free time →
  details passed. Document and dialog widths were both 430 px; no horizontal
  overflow was observed. The haircut flow also reached details at phone width.
- Live error inspection found extension-generated console messages, with no
  application error in the inspected entries.
- Public homepage, CSS/JS, availability, normal empty-booking validation and
  `/owner` redirect were checked around release. The empty POST returned 400
  and created no appointment.

The previously existing backend tests cover booking creation, validation,
double-booking races, tenant scoping, cancellation, rescheduling, closures,
buffers, timezone/DST and email rendering. Their stores and mailers are local
test fixtures. This session did not rerun the earlier live SQL race audit.

## Production release

- Worker: `vbarbers`, existing Cloudflare account and routes.
- Version: `4a7e85d9-a99b-4a05-add8-ccd67a2b8e25`.
- Previous version: `ae9be431-51d7-4369-94b4-f92bc766b855`.
- Customer URL: https://vbarbers.peregrineoffice.space/.
- The older https://vbarbers.peregrinepartners.space/ route is preserved.
- Supabase store, tenant, service-key secret, email binding and Office site URL
  are retained. No schedule change or database migration was made.
- No real booking was created, moved or cancelled, and no test customer or
  owner email was sent.

## Acceptance still requiring a real device or account

1. Open the live site from the original mobile entry point (including
   Instagram if that is where the problem occurred) and verify one tap opens
   booking on iPhone Safari and Android Chrome.
2. Use Vance's own account and phone for a real booking/diary/email acceptance
   cycle. Actual inbox delivery and the sibling Office application's signed-in
   experience were not verified in this session.

The older design-only review Worker was not updated by this production fix.
Already-open tabs retain the old JavaScript until they next load the page.

## Maintenance notes

Keep the scoped dependency overrides until the parent packages ship fixed
versions, then remove them only after `npm audit` remains clean. Do not apply
the original audit's suggested framework downgrades with `--force`.

Reference guidance used: [React hydration](https://react.dev/reference/react-dom/client/hydrateRoot),
[Workers permissions](https://developers.cloudflare.com/workers/authorization/workers/),
the installed Next client-component guides and project-local Wrangler help.
