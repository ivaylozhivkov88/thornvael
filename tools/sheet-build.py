"""One-shot: python tools/sheet-build.py <sheet.png> <unit>  -> frames, atlas in public/sprites, then check:atlases."""
import os, subprocess, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sheet, unit = sys.argv[1], sys.argv[2]
env = dict(os.environ, OPENBLAS_NUM_THREADS="1", MAX_ATLAS="2048")
run = lambda *a: subprocess.run(a, cwd=root, env=env, check=True)
run(sys.executable, "tools/sheet-to-unit.py", sheet, unit, "crop=auto", *sys.argv[3:])
run(sys.executable, "tools/pack-atlas.py", f"tools/.mesh-out/{unit}", "public/sprites", unit)
import json
note = f"Original {unit} sprite; Canva-generated 5-view turnaround sheet, 96px, 16 directions, stand4/walk8/attack4/cast4/hurt2/die4, RGB masks."
mp = os.path.join(root, "assets.json")
m = json.load(open(mp, encoding="utf-8"))
for suf in (".png", "-mask.png", ".json"):
    path = f"public/sprites/{unit}{suf}"
    e = {"path": path, "license": "own", "source": "tools/sheet-build.py + Canva sheet", "note": note}
    for i, a in enumerate(m["assets"]):
        if a["path"] == path:
            m["assets"][i] = e; break
    else:
        m["assets"].append(e)
open(mp, "w", encoding="utf-8").write(json.dumps(m, indent=2, ensure_ascii=False) + chr(10))
run("node", "tools/check-atlases.mjs")
