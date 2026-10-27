# Booking overlay follow-up — 28 October 2026

The user reported that the previous mobile fix still left the homepage visible
after tapping Make a Booking. They supplied https://vbarbers.vercel.app/ as a
working reference and asked to retain the current appearance.

## Comparison and evidence

- The working Vercel version and `origin/main` use a React-rendered `div`
  overlay with `role="dialog"`, opened by a direct booking command.
- The newer full-page design had changed this to a browser-native `dialog`
  inside the animated landing-page wrapper. The previous fix still depended
  on native presentation and a `hashchange` notification to open it.
- A component reproduction closed the native dialog independently. React
  retained its open state, and a subsequent booking tap did not restore the
  view. This failed against the previous implementation.
- Two new regressions also failed before implementation: an explicit tap
  while `#book` was already present and hash notifications were unavailable;
  and a native `showModal` call that did not present the dialog.
- The inspected desktop tab had the latest assets and showed booking. These
  reproductions demonstrate real failure paths; they do not establish the
  exact browser trigger on the reporting phone. The user's exact failing URL
  and mobile browser were requested and remain unconfirmed.

## Change

Restore React ownership of overlay visibility, matching the working reference's
mechanism while preserving the current full-page design, blue intro, rounded
controls, and entrance/exit animations. No clipper or old sheet styling was
restored.

The overlay is portaled to `document.body`, above the animated landing page.
Both booking links issue an explicit opening command, including when the URL
already contains `#book`. The native link remains as a pre-hydration fallback,
and the retained URL request is still read on mount. Browser history and page
restoration are synchronized through `popstate` and `pageshow` as well as hash
changes. Focus trapping, Escape, inert background, scroll locking, focus return
and the existing exit timeout are handled by the React overlay.

Booking links are hidden during the fresh-session landing entrance and become
visible when that entrance has finished. This prevents showing a tap target
while it is still moving under the visitor's finger. The final position and
appearance are unchanged, and the once-per-session intro is retained.

## Verification

- **74 tests passed**, including direct opening without a hash notification,
  independence from native dialog presentation, portal placement outside the
  animated landing page, focus wrapping and Escape cleanup.
- Cloudflare production build, route type generation, TypeScript, whitespace
  checks and deployment dry run passed. Existing adapter build warnings remain.
- The working Vercel reference was opened and its actual overlay inspected.
- The revised implementation opened and reopened in the local vinext browser
  preview at 390 px. A rapid scripted close attempted during entrance motion
  missed its target; a settled retry reached the close handler and completed.
  That automation attempt was not counted as a passing cycle.
- A live 390 px check reached the new overlay from both booking links. An
  immediate automated tap during a fresh navigation missed before the entrance
  guard was added. With the guard, a fresh local session showed no booking link
  during the intro; once visible, the page transform was `none`, the phase was
  `done`, and one click opened booking.
- Physical iPhone Safari, Android Chrome and Instagram browser acceptance have
  not been completed. No real appointment or email was created for testing.

## Release

Published through Wrangler to the existing `vbarbers` Worker and both
Office/Partners routes. Final version:
`bf8d48e3-4a85-4bd5-8086-4e8fcb823017`.

The prior session's version was `4a7e85d9-a99b-4a05-add8-ccd67a2b8e25`.
An intermediate overlay version, `23457592-2239-4b59-8669-218849f4bb11`, was
superseded by the final entrance guard.

A fresh live Chrome tab at **390 × 844** verified the final release. The
intro initially showed its skip control; the booking target became visible
with phase `done` and page transform `none`. Its first click opened the React
overlay at the body, with zero native dialogs and document width 390 px.
Physical-device acceptance remains pending; this result is not an assertion
that the user's exact device/browser has been tested.
