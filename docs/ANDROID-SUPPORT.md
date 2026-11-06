# Android phone and tablet support

Updated 2026-11-04. The product target is the same complete playability and quality with desktop mouse/keyboard and phone/tablet touch, using appropriate controls for each platform. PWA is the current baseline. There are no current payments; possible future advertising is undecided. This work adds no AdMob, ad SDK, tracking, cookies, accounts, native wrapper, store package or publishing flow. The full campaign and release scope remains unchanged.

## This bounded change

`src/pwa-install.ts` is a pure, dependency-injected controller used by the existing Install button in `src/main.ts`. It consumes a deferred browser event once, invokes prompt directly from the click, prevents concurrent activation until prompt and userChoice finish, and restores the button after dismissal or failure. Retrying a native prompt requires a fresh event. An accepted choice does not itself hide the button: appinstalled or standalone mode does. Display-mode changes, pageshow and visibility changes refresh the UI. Installation observed in this page remains remembered for this page's lifetime.

Native prompt availability is detected from the event's methods and choice promise, never an Android user-agent guess. Without an eligible event, the existing browser-menu instructions remain available. The existing iOS/iPadOS Share → Add to Home Screen fallback and its hint detection remain in main. Availability depends on browser support and eligibility; neither the button nor a synthetic test guarantees installation. Button labels and 44px CSS targets are unchanged.

The [Chrome team's install guidance](https://web.dev/articles/customize-install) describes deferred events, userChoice, appinstalled and discarding a consumed prompt. [Display-mode detection](https://web.dev/learn/pwa/detection) provides the basis for installed-mode checks. These signals do not prove offline asset completeness or persistence permission.

## Coverage audit (read-only, not rerun here)

| Flow | Existing automated coverage/source | Remaining acceptance gap |
| --- | --- | --- |
| Select, additive select, pan, pinch | `tests/input.test.ts`: mouse box/right-click, touch tap/Add, pan vs box mode, pinch, wheel; `tests/touch.test.ts`: double tap, portraits, radial bounds | Real Android phone and tablet multi-touch, browser edge gestures and long press |
| Aiming and cancel | Reticle/cancel region and gesture aim mode exist in `src/input.ts`; not rewritten | End-to-end touch aiming, release/cancel and interrupted gestures on real devices remain OPEN; selection tests do not establish aiming coverage |
| HUD and dialogs | `e2e/hud-layout.spec.ts`: 1366×768, 900×450, 844×390 bounds, hit targets, portraits and labels; `e2e/keyboard.spec.ts`: dialog keyboard ownership and interrupted selection; `e2e/smoke.spec.ts`: synthetic touch radial | Real phone/tablet readability, all modal flows and hardware keyboard parity |
| Shops and inventory | `tests/chapter1.test.ts`: town commands/carryover; `tests/touch.test.ts`: upkeep/scroll purchase; `e2e/hero-presentation.spec.ts`: named gear and explanations | Full shop/tavern/inventory touch playthrough on phone/tablet, overflow and all actions |
| Save/export/import | `e2e/savebackup.spec.ts`: campaign save restoration and export/import into a fresh context | Android file picker, downloads, backup round-trip and eviction recovery |
| Offline | `tests/offline.test.ts`: pack validation/download/error/resume/delete; `e2e/smoke.spec.ts`: offline reload | Installed Android airplane-mode launch, downloaded chapter completion and storage pressure |
| Rotation/context lifecycle | Existing responsive safe-area/portrait CSS; visibility handlers in main; no renderer lifecycle change in this task | Phone/tablet rotate mid-aim/dialog, background/resume, WebGL loss/restore, memory pressure and audio interruptions remain OPEN |
| Install | New `tests/pwa-install.test.ts`: Node controller lifecycle. New `e2e/android-install.spec.ts`: synthetic event wiring, busy button, fallback, display-mode/appinstalled at phone/tablet sizes | Native Chrome eligibility/prompt/dismiss/retry, menu install, standalone cold start and uninstall/reinstall on real Android |

## Evidence and next gates

Baseline game source was `bc4d811`. Targeted Node Vitest: **10 passed** with `npx vitest run tests/pwa-install.test.ts --maxWorkers=1` (latest run 2026-11-04 14:16 Sofia). Initial `npm run typecheck` failed at independently owned `src/audio.ts:69` with TS2367. A subsequent run after the concurrent iOS edits **passed both application and service-worker typechecks**. Parent still owns final serial checks on the integrated source. `git diff --check` also passed.

The new browser spec is **prepared, NOT RUN** pending parent GO when CPU is idle. Its viewports and hasTouch setting are browser emulation; its prompt/media events are synthetic. Historical existing suite coverage is listed above as an audit, not a fresh pass for these edits. **Actual real Android phone: NOT TESTED. Actual real Android tablet: NOT TESTED.** No mobile release acceptance is claimed.

Parent gates: review this bounded diff; build the integrated source; run the targeted browser spec serially, then required final checks. Example targeted gate after build in PowerShell: `$env:PW_CHANNEL='chrome'; npx playwright test e2e/android-install.spec.ts`. Then collect exact device/browser/build evidence for every OPEN row on a phone and tablet.

Cross-file handoff: unchanged `strings.ts` install instructions currently imply offline availability after installation. That wording needs a separate authorized localization change to distinguish installation from downloaded offline content, and to qualify browser menu availability. Do not claim every browser exposes an install command. No strings, CSS, manifest, offline, service worker, input, renderer, simulation or audio changes were made by this task. Any resulting device defects in those files belong to the parent backlog.
