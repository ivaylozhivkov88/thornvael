"""One-shot: python tools/sheet-build.py <sheet.png> <unit>  -> frames, atlas in public/sprites, then check:atlases."""
import os, subprocess, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sheet, unit = sys.argv[1], sys.argv[2]
env = dict(os.environ, OPENBLAS_NUM_THREADS="1", MAX_ATLAS="2048")
run = lambda *a: subprocess.run(a, cwd=root, env=env, check=True)
run(sys.executable, "tools/sheet-to-unit.py", sheet, unit, "crop=auto")
run(sys.executable, "tools/pack-atlas.py", f"tools/.mesh-out/{unit}", "public/sprites", unit)
run("node", "tools/check-atlases.mjs")
