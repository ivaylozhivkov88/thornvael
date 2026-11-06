# iPhone and iPad browser/PWA acceptance

Updated 2026-11-04. Target: equally polished desktop mouse/keyboard, phone and tablet flows. Current delivery is a browser/PWA. No App Store/native wrapper, purchases, Apple credentials, ads SDK, tracking or cookies are introduced by this work. Future advertising is undecided.

## Audio behavior implemented

`src/audio.ts` keeps its public exports and uses the existing `main.ts` visibility handler. It adds no lifecycle listeners. Before `unlock()` there is no context or media creation. Callers must keep initial `unlock()` inside a real input gesture; foreground recovery does not create a context. Resume/suspend rejections are consumed; the next gesture can retry. At most one context resume/suspend is pending, with no watchdog, polling or automatic retry loop.

An interrupted context is retained for retry, rather than closed on the assumption that interruption is permanent. A genuinely closed context is replaced only at the next gesture. Its sources and media are stopped, source nodes/media elements are rebuilt, and its short-buffer cache is discarded and reloaded. This deliberately bounded cache reset avoids retaining obsolete graph/loading state; it is not a claim that AudioBuffer objects universally require replacement. Context identity guards prevent old fetch/decode results from reaching the replacement graph. Concurrent requests for the same short buffer share one promise.

Backgrounding stops ambience and pauses media. Generation checks reject stale ambience starts; a late resume is suspended again if still backgrounded. Pending suspend completion reconciles a return to foreground. Media play completion checks current intent, preventing late playback after mute/background/context replacement. SFX/music/ambience intent and the 12-voice limit survive recovery. Music remains streamed HTMLAudioElement audio, never full-track PCM decoding. Existing AAC assets and music crossfades remain in use.

If a browser leaves `resume()` pending forever, this implementation deliberately does not add a timer or continuously recreate contexts. That scenario remains a real-device diagnostic item. Successful promises or mock tests do not prove audible output, silent-switch behavior or autoplay permission on iOS.

API references: [resume rejection on closed contexts](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume), [running/suspended/interrupted/closed states](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state), [media playback promises and autoplay rejection](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play).

## Coverage and device audit matrix

Run every OPEN row on **iPhone Safari, iPhone Home Screen PWA, iPad Safari and iPad Home Screen PWA**. Record model, OS/browser version, orientation, input device, URL/build revision, steps and result. On iPad repeat applicable flows with keyboard/trackpad. Existing tests below describe source coverage; only the targeted audio tests and typecheck were executed in this task.

| Flow | Existing implementation/test coverage | Required real-device check — OPEN |
|---|---|---|
| Install / launch | Shared install helper and main integration belong to the Android agent; shell smoke tests exist | Safari Share → Add to Home Screen → launch; confirm instructions match OS, standalone navigation, return from Safari; no duplicate install hints |
| Notch / viewport / rotation | `style.css` uses safe-area insets and `100dvh`; `e2e/hud-layout.spec.ts` checks command geometry | Both landscape directions, portrait rotate overlay, browser toolbar expand/collapse, iPad split view; no clipped dialogs, HUD or cancel targets; ≥44 px controls |
| Tap / hold / selection / pan / pinch | `e2e/squad-controls.spec.ts` synthetic Pointer Events cover selection, move, pan, Box+Add and hold release; `e2e/smoke.spec.ts` covers radial menu | Real multitouch pinch focal point, two-finger pan, hold without accidental order, selection and additive selection; interruption mid-gesture must cancel safely |
| Desktop / tablet keyboard parity | `e2e/keyboard.spec.ts` and squad controls cover shortcuts, held keys, modal ownership and cancellation | iPad hardware keyboard/trackpad equivalents, focus recovery, Escape/cancel; compare with desktop actions and accessible touch alternatives |
| Spell aim / cancel | Existing spell/gesture logic and unit tests; generic move-order cancellation E2E is not proof of touch spell parity | Drag aim, valid/invalid unit/ground targets, release to cast once, cancel zone, pointer cancellation, insufficient mana; no accidental cast after backgrounding |
| Dialog / shop / inventory | `e2e/town-fidelity.spec.ts` covers shop stock/pack operations, narrow layouts, tavern and modal keyboard isolation; `tests/touch.test.ts` includes inventory/spell rules | Scroll/inspect/equip/unequip, buy/sell/undo and tavern hire with fingers; every close/confirm action reachable, no battlefield input leak |
| Save / export / import | `e2e/savebackup.spec.ts` covers capture/load and fresh-context import; keyboard suite covers save-name focus | Safari and standalone file picker/share/download behavior; export then import after site data clearing, readable refusal of bad saves, persistence after relaunch |
| Offline / update | Offline unit tests and smoke load/select/move/offline reload; safe SW policy belongs to shell owner | Download chapter while online, airplane mode relaunch/play/save/load; Safari and PWA separately; waiting update must not reload a running mission |
| Audio / mute / interruption | `tests/audio-recovery.test.ts` tests real exports with Node mocks; existing `tests/audio.test.ts` tests voice decisions | Cold silent launch; first tap/key; SFX/music independently off/on; physical silent switch, volume, headphone/Bluetooth changes, lock/unlock, app switch, incoming interruption; verify actual sound and no duplicates |
| Context loss / BFCache | Audio tests cover closed/interrupted contexts and delayed operations; `src/diag.ts` has a WebGL diagnostic | Back/forward restoration, repeated long/short background cycles, memory pressure; verify renderer, controls and audio recover together, progress remains intact |

## Parent-owned handoff

At inspection, `src/main.ts:1312` owns audio visibility reconciliation, `:1107` has autosave on `pagehide`, and `:1528` refreshes install UI on `pageshow`. There is no audio-specific pagehide/pageshow reconciliation. A BFCache restore with no matching visibility event may therefore need explicit handling by the main owner. This is a wiring gap to validate, not a proven Safari failure. If added, reuse the exported suspend/resume functions and reset input/timing in the same main lifecycle integration; do not add duplicate listeners inside audio.ts. Main, input, CSS, shell and renderer were not edited here.

No Playwright/WebKit run or browser installation was performed: parent must authorize E2E after CPU profiling is idle. Existing Playwright configuration has no dedicated WebKit project. WebKit emulation can complement these checks; real Safari/PWA acceptance remains mandatory. This document does not claim mobile or release completion.
