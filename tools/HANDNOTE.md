# HANDNOTE - sprite redo via Canva (updated 2026-11-19 02:28)

Repo: D:/ROM 2 clone/game. Plan order: 1) ordinary monsters (5-view turnaround) 2) heroes+bosses (9 views, key-pose sheets, maybe 192 cell; test warrior first, show user) 3) map visuals 4) random-map skirmish generator (HoMM3 only as logic reference, never copy assets).
Rules: stop at weekly usage 98%; reply to user in Bulgarian, short; push after each step; commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; never touch game/src/sim/path.ts, tests/movement.test.ts, models/, tools/render-unit.py.

## Per-unit protocol (one unit at a time, Canva has a cooldown ~400 s after each call)
1. `sleep 400` (cooldown), then Haiku agent step A: Canva generate-image LANDSCAPE_2_1, prompt from tools/canva-batch.py TPL with a good one-line creature description, magenta #ff00ff background; reply "COOLDOWN <MEDIA id>" (or none on quota -> wait 400 s, retry).
2. `sleep 400`, then Haiku agent step B: create-design with references [MEDIA id], brief "Place this image full-bleed as the only content, no text, no changes, landscape.", poll get-create-design-async-job, export-design png pro, curl -L to tools/.canva-sheets/<unit>.png.
3. `python tools/sheet-build.py tools/.canva-sheets/<unit>.png <unit>` ; `npm run check:atlases` ; `echo ok > tools/.canva-sheets/<unit>.done` ; `python tools/handnote.py`.
4. Every ~5 units: `npx tsc --noEmit; npm run check:repo; npm run check:atlases`, commit own files (public/sprites, assets.json, tools/canva-units.json, tools/HANDNOTE.md), push.
After 3 failures on one unit: pause it, continue, report DONE/REDO at the end.

## Status
DONE (30/52): briar-hound flintback mire-wisp ruin-mite thorn-boar quill-fiend fallen-shaman glasswing rootbound cinderling gloom-stag salt-crab fetish-blowdart witch-doctor hollow-knight spore-matron dune-lurker storm-kite basalt-brute sand-raider pale-burrower rift-moth greater-mummy silt-colossus redglass-drake night-orchard stormtree doom-knight cinderhorn anvilmaw-smith

TODO (22): dune-scarab claw-viper dune-beast maggot-swarm lantern-eel ash-weaver ironbark hollow-king wendigo-bruiser crowned-maw frost-bell morvessa gorrathul vesperion ashkarath hero warrior archer mage gnoll golem imp

Missing descriptions in canva-units.json (write one first): gnoll golem imp mage hero warrior archer + bosses morvessa gorrathul vesperion ashkarath. Many existing ones are generic - a better one-liner gives better art.

## End of run
Tune FAMILY_VISUALS in src/render.ts (~line 121) via ?art=1 (dev server thornvael-dev port 5199), full vitest, update PROGRESS.md, final Bulgarian report with DONE/REDO.
