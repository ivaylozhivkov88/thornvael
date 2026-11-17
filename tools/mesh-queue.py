"""Resumable batch runner for mesh-based unit sprites. No LLM needed: run it and walk away.

Usage:  python tools/mesh-queue.py [unit ...]      (default: every unit in QUEUE not yet done)
        python tools/mesh-queue.py --status
        python tools/mesh-queue.py --redo hero     (forget a unit and render it again)
For each unit: blender render (416 frames, colour + mask) -> border check -> pack -> check:atlases.
State lives in .planning/mesh-queue.json (committed), renders in tools/.mesh-out/<unit> (ignored).
Add a unit: write tools/mesh-units/<module>.py, register it in UNITS of render-mesh-unit.py and in QUEUE below.
"""
import glob
import json
import os
import subprocess
import sys
import time

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
STATE = os.path.join(ROOT, ".planning", "mesh-queue.json")
BLENDER = os.environ.get("BLENDER", r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe")
# unit id -> cell px (atlas side comes from MAX_ATLAS)
QUEUE = {"warrior": 96, "hero": 96, "archer": 96, "mage": 96}


def load():
    return json.load(open(STATE)) if os.path.exists(STATE) else {}


def save(s):
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    json.dump(s, open(STATE, "w"), indent=2, sort_keys=True)


def border_bad(out):
    bad = []
    for f in glob.glob(os.path.join(out, "*_[0-9][0-9].png")):
        im = Image.open(f)
        w, h = im.size
        px = im.split()[3].load()
        if any(px[x, 0] or px[x, h - 1] or px[0, x] or px[w - 1, x] for x in range(min(w, h))):
            bad.append(os.path.basename(f))
    return bad


def run(unit, cell):
    out = os.path.join(ROOT, "tools", ".mesh-out", unit)
    t = time.time()
    subprocess.run([BLENDER, "-b", "-P", os.path.join(ROOT, "tools", "render-mesh-unit.py"), "--", out, unit, str(cell)],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    n = len(glob.glob(os.path.join(out, "*_[0-9][0-9].png")))
    if n != 416:
        return {"status": "failed", "why": "%d frames" % n}
    bad = border_bad(out)
    if bad:
        return {"status": "failed", "why": "border-touching frames: " + ", ".join(sorted(bad)[:8])}
    env = dict(os.environ, MAX_ATLAS="2048" if cell > 48 else "1024")
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "pack-atlas.py"), out, os.path.join(ROOT, "public", "sprites"), unit],
                   check=True, env=env, stdout=subprocess.DEVNULL)
    return {"status": "done", "seconds": round(time.time() - t), "cell": cell}


def main():
    args = sys.argv[1:]
    s = load()
    if "--status" in args:
        for u in QUEUE:
            print("%-10s %s" % (u, s.get(u, {}).get("status", "todo")), s.get(u, {}).get("why", ""))
        return
    if "--redo" in args:
        for u in args[args.index("--redo") + 1:]:
            s.pop(u, None)
        save(s)
        args = [a for a in args if a != "--redo" and a not in QUEUE or a in QUEUE]
    todo = [a for a in args if a in QUEUE] or [u for u in QUEUE if s.get(u, {}).get("status") != "done"]
    for u in todo:
        if s.get(u, {}).get("status") == "done" and u not in args:
            continue
        print("rendering", u, flush=True)
        try:
            s[u] = run(u, QUEUE[u])
        except Exception as e:  # keep going with the next unit
            s[u] = {"status": "failed", "why": str(e)[:200]}
        save(s)
        print(u, s[u], flush=True)


if __name__ == "__main__":
    main()
