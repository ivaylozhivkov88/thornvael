"""Batch: for each unit run a cheap Haiku `claude -p` that drives Canva (generate -> design -> export -> download),
then build the atlas locally with sheet-build.py. Resumable: finished units leave tools/.canva-sheets/<unit>.done.
Usage: python tools/canva-batch.py units.json [unit ...]   (units.json: {"unit": "visual description", ...})"""
import json, os, subprocess, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, "tools", ".canva-sheets"); os.makedirs(out, exist_ok=True)
units = json.load(open(sys.argv[1], encoding="utf-8"))
todo = sys.argv[2:] or list(units)
MCP = "mcp__b34dec87-cd15-46ad-834c-54a9175ba4f4"
TPL = ("Use ONLY the Canva MCP tools. Steps: 1) generate-image aspectRatio LANDSCAPE_2_1 with prompt: "
 "\"Game character turnaround sheet on a flat solid magenta (#ff00ff) background: five views of the SAME creature in one horizontal row, "
 "evenly spaced, identical scale, full body, nothing overlapping: front, front-left three-quarter, left profile, back-left three-quarter, back. "
 "Creature: {d}. Painted dark-fantasy RPG sprite style, consistent colours across views, no text, no shadow, no ground.\" "
 "2) poll get-generate-image-job every 20s until SUCCESS (retry on connector error), take the MEDIA id. "
 "3) create-design with references [MEDIA id], brief 'Place this image full-bleed as the only content, no text, no changes, landscape.' (retry once on internal_error); "
 "poll get-create-design-async-job honouring wait_seconds until completed. 4) export-design png export_quality pro. "
 "5) download the URL with curl to {p}. Reply with only OK or FAIL.")
import time
def report(stopped):
    done_l = [u for u in todo if os.path.exists(os.path.join(out, u + ".done"))]
    left = [u for u in todo if u not in done_l]
    txt = ("DONE (%d): %s" % (len(done_l), " ".join(done_l))) + chr(10) + ("REDO (%d): %s" % (len(left), " ".join(left))) + chr(10)
    if stopped: txt += "STOPPED at " + stopped + chr(10)
    open(os.path.join(out, "report.txt"), "w").write(txt); print(txt, flush=True)
def attempt(u, p):
    if os.path.exists(p): return True
    r = subprocess.run(["claude", "-p", TPL.format(d=units[u], p=p), "--model", "haiku",
        "--allowedTools", MCP, "Bash", "--permission-mode", "bypassPermissions"], capture_output=True, text=True, cwd=root)
    print(u, "claude:", r.stdout.strip()[-80:], flush=True)
    return os.path.exists(p)
for u in todo:
    if os.path.exists(os.path.join(out, u + ".done")): continue
    p = os.path.join(out, u + ".png").replace("\\", "/")
    ok = False
    for n in range(3):  # 3 tries, 1 minute apart, never skip a unit
        if attempt(u, p): ok = True; break
        print(u, f"attempt {n+1}/3 failed", flush=True)
        if n < 2: time.sleep(60)
    if not ok:
        report(u); sys.exit(1)  # pause: rerun the same command to resume from this unit
    b = subprocess.run([sys.executable, "tools/sheet-build.py", p, u], cwd=root, capture_output=True, text=True)
    print(u, "build", b.returncode, b.stderr.strip()[-200:], flush=True)
    if b.returncode == 0: open(os.path.join(out, u + ".done"), "w").write("ok")
report(None)
