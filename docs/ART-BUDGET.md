# Desktop art budget diagnostic (10.5)

Use `?crowd&artstress=1` for 300 living animated visuals, alternating hero/archer/golem (100 of each) through the real `UnitSprite` update/render path. `?battle&artstress=1` uses the same presentation override with existing combat. The flag is ignored without `crowd` or `battle`. No sim kinds, state, gameplay scale, save data or update timing change. `?stress` alone mostly uses Warrior fallback visuals and is not a valid new-art workload.

Read-only `window.__game.artMetrics()` reports total, art, visible and on-screen art counts; family counts; shared GPU source count; approximate RGBA atlas bytes; filters; layers, quality and resolution. These snapshots scan sprites only when requested. `__game.stats()` copies the existing one-second FPS/draw/step/worst-frame report, with sample timestamp, quality, resolution and pause state. No added per-frame diagnostic allocations or timers.

Parent owns full build, preview/browser execution and commits/push. After parent's build, run from `game/` in PowerShell:

```powershell
$env:PW_PORT='4187'
$env:PW_CHANNEL='chrome'
npx --no-install playwright test e2e/artbudget.spec.ts --workers=1 --reporter=list,html
```

The existing Playwright configuration reuses the parent's preview on port 4187 (or starts a preview of the existing build if none exists). The test uses a 2304×1728 desktop viewport at zoom 1 to fit the entire world. It confirms all 300 art instances are actually visible and on-screen, each family shares one GPU source, there are no per-unit filters, all units receive changing animation frames, and sim kinds match the normal crowd. It then collects four distinct live timing snapshots over roughly three seconds after the first warmup report, and writes an attached `desktop-art-budget.json`, screenshot and console JSON. No FPS threshold: headless/software GPU results describe that environment only. Parent should also check the screenshot for the scene and verify the page stayed foreground.

Interpretation: `drawMs` is the existing main-loop presentation CPU timer, including effects/audio and periodic HUD/minimap work. It is not GPU duration or draw-call count. `stepMs` is the existing mean sim step cost. `worstMs` is the maximum capped frame interval in the last report. Quality can adapt down during a slow run and is recorded per sample; compare samples at matching resolution/quality. On-screen counts use visible sprite origins, not pixel occlusion by UI or neighbours.

Atlas storage is estimated as physical source width × height × four RGBA bytes, once per unique source. With three 1024² sheets each split into a 2048² four-layer source, this is **48 MiB of unit-atlas RGBA storage** before chunks, framebuffers, driver copies, mipmaps, CPU source images or temporary decode memory. This is a meaningful constraint for later phone testing, not a measured total-process/GPU peak. Source sharing is proven by the test; an actual GPU allocation or draw-call profiler is not added here.

## Execution status

Parent Chrome run on 2026-11-02 passed: all300 art instances on screen,100 per family,3 sources and no filters, at2304×1728/DPR1/High quality. Across4 one-second reports, observed FPS43.36–60.05, presentation CPU2.59–2.97ms/frame and mean sim step0.18–0.45ms. The first report includes startup; this brief stationary-crowd sample is not a sustained battle or hardware/device benchmark. The spec writes desktop-art-budget.json and a screenshot to its test output. Desktop measurements alone do not complete the Phase10 exit gate: Android/iPhone memory/FPS/art review and mass-roster go/no-go remain pending.
