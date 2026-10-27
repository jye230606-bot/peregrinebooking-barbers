# Working booking checkpoint — 28 October 2026

The user confirmed mobile booking was working and requested this checkpoint
before adjusting intro duration and the booking control's appearance.

## Stable release

- Git tag: `checkpoint/working-booking-2026-10-28`, annotated and pushed to
  `origin` on GitHub before implementation of the timing changes.
- Commit: `93bb4c1` (`fix: restore reliable booking overlay presentation`).
- Cloudflare Worker: `vbarbers`.
- Cloudflare version: `bf8d48e3-4a85-4bd5-8086-4e8fcb823017`, verified active
  at 100% when the checkpoint was created.
- Domains: `vbarbers.peregrineoffice.space` and
  `vbarbers.peregrinepartners.space`.
- Customer booking opens through the React portal overlay and explicit booking
  commands. Its controls are hidden until the page entrance settles.

## Rollback reference

If a later change breaks the working experience, the saved Worker version can
be restored through the installed Wrangler CLI:

```sh
npx wrangler rollback bf8d48e3-4a85-4bd5-8086-4e8fcb823017 --name vbarbers --message "Restore user-confirmed working booking checkpoint"
```

This is a reference command, not an instruction to run it now. A Worker rollback
does not roll back appointment data. For source recovery, use the Git tag;
preserve any later work rather than resetting a working tree destructively.

## Requested next adjustment

- Double the blue logo hold from 600 ms to 1200 ms.
- Keep the 600 ms page slide and extend its event fallback to 2000 ms total.
- Fade the main booking control in over the existing 180 ms motion token once
  the page reaches `done`. Its hit target stays hidden until then.
- Retain the working overlay mechanism, reduced-motion handling, skip control
  and once-per-session behavior.

## Timing update release

Published Worker version: `992867f5-9352-4419-a36f-8110bfd7a141`.
The rollback checkpoint above remains the version from before these changes.

Verification: 74 tests passed; Cloudflare build, route types, TypeScript,
whitespace checks and deployment dry run passed. Impeccable's scoped detector
returned no findings. Desktop and 390 px local previews showed a 180 ms opacity
transition. The live 390 px check confirmed phase `done`, no page transform,
the 180 ms fade, and successful opening on the first booking click.
