# Overnight run (start on user's "ДАВАЙ")

Goal: finish all sprites in one unattended run, minimal tokens.

Loop (serial, Haiku subagents for Canva, one unit per subagent, never parallel):
1. Todo = units in tools/canva-units.json without tools/.canva-sheets/<u>.done.
2. Missing description (bosses morvessa/gorrathul/vesperion/ashkarath, hero, warrior, archer, mage, gnoll, golem, imp): write it first, one line each.
3. Per unit: Haiku subagent does generate-image -> create-design -> export-design -> curl to tools/.canva-sheets/<u>.png (template in tools/canva-batch.py TPL).
4. Then `python tools/sheet-build.py tools/.canva-sheets/<u>.png <u>` (writes provenance, runs check-atlases).
5. On quota_cooldown: wait 10 min (ScheduleWakeup/Monitor, no polling spam), retry; after 3 fails pause that unit, continue with next, report at end.
6. After every 5 units: `npx tsc --noEmit; npm run check:repo; npm run check:atlases`, commit own files only (never game/src/sim/path.ts, tests/movement.test.ts, models/), push.
7. Stop rules: weekly usage 98% (also daily cap via usage-limit.js record). Write progress to tools/.canva-sheets/report.txt (DONE/REDO).
8. End: FAMILY_VISUALS scale tuning via ?art=1, full vitest, final push, summary in Bulgarian.
After sprites: static elements trial (trees/buildings), then random-map skirmish generator (separate task).
