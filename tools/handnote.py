"""Regenerates tools/HANDNOTE.md (hand-over for any agent: Claude, Antigravity...). Run after every unit."""
import json,os,time
r=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
u=json.load(open(r+'/tools/canva-units.json',encoding='utf-8'))
d=[k for k in u if os.path.exists(f'{r}/tools/.canva-sheets/{k}.done')]
t=[k for k in u if k not in d]
open(r+'/tools/HANDNOTE.md','w',encoding='utf-8').write(f"""# HANDNOTE - sprite redo via Canva (updated {time.strftime('%Y-%m-%d %H:%M')})

Repo: D:/ROM 2 clone/game. Plan order: 1) ordinary monsters (5-view turnaround) 2) heroes+bosses (9 views, key-pose sheets, maybe 192 cell; test warrior first, show user) 3) map visuals 4) random-map skirmish generator (HoMM3 only as logic reference, never copy assets).
Rules: stop at weekly usage 98%; reply to user in Bulgarian, short; push after each step; commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; never touch game/src/sim/path.ts, tests/movement.test.ts, models/, tools/render-unit.py.

## Per-unit protocol (one unit at a time, Canva has a cooldown ~400 s after each call)
1. `sleep 400` (cooldown), then Haiku agent step A: Canva generate-image LANDSCAPE_2_1, prompt from tools/canva-batch.py TPL with a good one-line creature description, magenta #ff00ff background; reply "COOLDOWN <MEDIA id>" (or none on quota -> wait 400 s, retry).
2. `sleep 400`, then Haiku agent step B: create-design with references [MEDIA id], brief "Place this image full-bleed as the only content, no text, no changes, landscape.", poll get-create-design-async-job, export-design png pro, curl -L to tools/.canva-sheets/<unit>.png.
3. `python tools/sheet-build.py tools/.canva-sheets/<unit>.png <unit>` ; `npm run check:atlases` ; `echo ok > tools/.canva-sheets/<unit>.done` ; `python tools/handnote.py`.
4. Every ~5 units: `npx tsc --noEmit; npm run check:repo; npm run check:atlases`, commit own files (public/sprites, assets.json, tools/canva-units.json, tools/HANDNOTE.md), push.
After 3 failures on one unit: pause it, continue, report DONE/REDO at the end.

## Status
DONE ({len(d)}/{len(u)}): {' '.join(d)}

TODO ({len(t)}): {' '.join(t)}

Missing descriptions in canva-units.json (write one first): gnoll golem imp mage hero warrior archer + bosses morvessa gorrathul vesperion ashkarath. Many existing ones are generic - a better one-liner gives better art.

## End of run
Tune FAMILY_VISUALS in src/render.ts (~line 121) via ?art=1 (dev server thornvael-dev port 5199), full vitest, update PROGRESS.md, final Bulgarian report with DONE/REDO.
""")
print(len(d),len(t))
