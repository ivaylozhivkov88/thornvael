// Shared deterministic map-upscaling helper for Act II (128x128), Act III (192x192), Act IV (256x256).
// Reads original *.map.json (never overwrites) and emits new *-N.map.json files.
import fs from 'node:fs';
import path from 'node:path';

const WATER = 2;
const ROCK = 3;

const rleDecode = (r, n) => {
  const out = new Uint8Array(n);
  let k = 0;
  for (let i = 0; i + 1 < r.length && k < n; i += 2) {
    const end = Math.min(n, k + r[i + 1]);
    out.fill(r[i], k, end);
    k = end;
  }
  return out;
};

const rleEncode = (a) => {
  const out = [];
  for (let i = 0; i < a.length; ) {
    let j = i + 1;
    while (j < a.length && a[j] === a[i]) j++;
    out.push(a[i], j - i);
    i = j;
  }
  return out;
};

const clampCoord = (v, max) => Math.max(0, Math.min(max - 1, Math.round(v)));

export function scaleMissionMap(missionsDir, baseName, targetSize) {
  const srcPath = path.join(missionsDir, `${baseName}.map.json`);
  const src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
  const sw = src.w;
  const sh = src.h;
  const scaleX = targetSize / sw;
  const scaleY = targetSize / sh;
  const sx = (x) => clampCoord(x * scaleX, targetSize);
  const sy = (y) => clampCoord(y * scaleY, targetSize);

  const srcTerrain = rleDecode(src.terrain, sw * sh);
  const srcHeight = rleDecode(src.height, sw * sh);
  const dstTerrain = new Uint8Array(targetSize * targetSize);
  const dstHeight = new Uint8Array(targetSize * targetSize);

  for (let y = 0; y < targetSize; y++) {
    const oy = Math.min(sh - 1, Math.floor((y * sh) / targetSize));
    for (let x = 0; x < targetSize; x++) {
      const ox = Math.min(sw - 1, Math.floor((x * sw) / targetSize));
      dstTerrain[y * targetSize + x] = srcTerrain[oy * sw + ox];
      dstHeight[y * targetSize + x] = srcHeight[oy * sw + ox];
    }
  }

  const unitOccupied = new Set();
  const findPassable = (tx, ty) => {
    for (let r = 0; r <= 6; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = clampCoord(tx + dx, targetSize);
          const ny = clampCoord(ty + dy, targetSize);
          const t = dstTerrain[ny * targetSize + nx];
          if (t !== WATER && t !== ROCK) return [nx, ny];
        }
      }
    }
    return [tx, ty];
  };

  const units = (src.units || []).map((u) => {
    const [ux, uy] = findPassable(sx(u.x), sy(u.y));
    unitOccupied.add(`${ux},${uy}`);
    return { ...u, x: ux, y: uy };
  });

  const objOccupied = new Set();
  const objects = [];
  for (const o of src.objects || []) {
    const ox = sx(o.x);
    const oy = sy(o.y);
    const key = `${ox},${oy}`;
    if (objOccupied.has(key) || unitOccupied.has(key)) continue;
    if (o.kind === 1) {
      let conflict = false;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          if (unitOccupied.has(`${ox + dx},${oy + dy}`)) conflict = true;
        }
      }
      if (conflict) continue;
    }
    objOccupied.add(key);
    objects.push({ ...o, x: ox, y: oy });
  }

  const findClearPassable = (tx, ty) => {
    for (let r = 0; r <= 6; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = clampCoord(tx + dx, targetSize);
          const ny = clampCoord(ty + dy, targetSize);
          const t = dstTerrain[ny * targetSize + nx];
          if (t !== WATER && t !== ROCK && !objOccupied.has(`${nx},${ny}`)) return [nx, ny];
        }
      }
    }
    return [tx, ty];
  };

  const regions = (src.regions || []).map((r) => ({
    ...r,
    x1: sx(r.x1),
    y1: sy(r.y1),
    x2: sx(r.x2),
    y2: sy(r.y2),
  }));

  const waypoints = src.waypoints
    ? src.waypoints.map((w) => {
        const [wx, wy] = findClearPassable(sx(w.x), sy(w.y));
        return { ...w, x: wx, y: wy };
      })
    : undefined;
  const shrines = src.shrines
    ? src.shrines.map((s) => {
        const [shx, shy] = findClearPassable(sx(s.x), sy(s.y));
        return { ...s, x: shx, y: shy };
      })
    : undefined;
  const exits = src.exits
    ? src.exits.map((e) => {
        const [ex, ey] = findClearPassable(sx(e.x), sy(e.y));
        return { ...e, x: ex, y: ey };
      })
    : undefined;

  const scaleExpr = (expr) => {
    if (!expr || !Array.isArray(expr.a)) return expr;
    if ((expr.k === 'unitInBox' || expr.k === 'carriedAt') && expr.a.length >= 5) {
      return {
        ...expr,
        a: [expr.a[0], sx(expr.a[1]), sy(expr.a[2]), sx(expr.a[3]), sy(expr.a[4])],
      };
    }
    return expr;
  };

  const scaleAct = (act) => {
    if (!act || !Array.isArray(act.a)) return act;
    if (act.k === 'gSwarm' && act.a.length >= 3) {
      return { ...act, a: [act.a[0], sx(act.a[1]), sy(act.a[2])] };
    }
    if ((act.k === 'dropGold' || act.k === 'spawn') && act.a.length >= 3) {
      return { ...act, a: [act.a[0], sx(act.a[1]), sy(act.a[2]), ...act.a.slice(3)] };
    }
    return act;
  };

  const triggers = (src.triggers || []).map((t) => ({
    ...t,
    conds: (t.conds || []).map((c) => ({
      ...c,
      a: scaleExpr(c.a),
      b: scaleExpr(c.b),
    })),
    acts: (t.acts || []).map(scaleAct),
  }));

  const text = { ...(src.text || {}) };
  for (const [k, v] of Object.entries(text)) {
    if (k.startsWith('obj.') && k.endsWith('.pos') && typeof v === 'string') {
      const [px, py] = v.split(',').map(Number);
      if (Number.isFinite(px) && Number.isFinite(py)) {
        text[k] = `${sx(px)},${sy(py)}`;
      }
    }
  }

  const outDoc = {
    ...src,
    name: `${src.name} (${targetSize}x${targetSize})`,
    w: targetSize,
    h: targetSize,
    terrain: rleEncode(dstTerrain),
    height: rleEncode(dstHeight),
    objects,
    units,
    regions,
    triggers,
    text,
    ...(waypoints ? { waypoints } : {}),
    ...(shrines ? { shrines } : {}),
    ...(exits ? { exits } : {}),
  };

  const outFile = `${baseName}-${targetSize}.map.json`;
  fs.writeFileSync(path.join(missionsDir, outFile), `${JSON.stringify(outDoc, null, 2)}\n`, 'utf8');
  return { file: outFile, w: targetSize, h: targetSize, units: units.length, objects: objects.length, triggers: triggers.length };
}
