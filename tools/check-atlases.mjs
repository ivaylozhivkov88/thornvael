// No dependencies: validate metadata using the SAME TS contract as the renderer,
// then decode the shipped PNG pixels (Node 24 type stripping and zlib).
import { readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { checkSheet } from '../src/sprites/contract.ts';

export function decodePng(bytes) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw Error('invalid PNG signature');
  let w = 0, h = 0;
  const data = [];
  for (let p = 8; p < bytes.length;) {
    const n = bytes.readUInt32BE(p), kind = bytes.toString('ascii', p + 4, p + 8);
    if (p + 12 + n > bytes.length) throw Error('truncated PNG chunk');
    if (kind === 'IHDR') {
      w = bytes.readUInt32BE(p + 8); h = bytes.readUInt32BE(p + 12);
      if (!w || !h || w > 2048 || h > 2048 || bytes[p + 16] !== 8 || bytes[p + 17] !== 6 || bytes[p + 20] !== 0) throw Error('expected <=2048px noninterlaced RGBA8 PNG');
    }
    if (kind === 'IDAT') data.push(bytes.subarray(p + 8, p + 8 + n));
    p += n + 12;
  }
  if (!w || !h) throw Error('missing PNG dimensions');
  const stride = w * 4;
  const raw = inflateSync(Buffer.concat(data), { maxOutputLength: (stride + 1) * h });
  if (raw.length !== (stride + 1) * h) throw Error('invalid PNG pixel count');
  const pixels = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw Error('invalid PNG filter');
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x;
      const a = x >= 4 ? pixels[i - 4] : 0, b = y ? pixels[i - stride] : 0, c = y && x >= 4 ? pixels[i - stride - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const prediction = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      pixels[i] = raw[y * (stride + 1) + x + 1] + prediction;
    }
  }
  return { w, h, pixels };
}

export function checkAtlasFiles(root = 'public/sprites', provenance = 'assets.json') {
  const errors = [], seen = new Set();
  const manifest = JSON.parse(readFileSync(provenance, 'utf8')).assets;
  const files = readdirSync(root);
  for (const name of files.filter((f) => f.endsWith('.json'))) {
    try {
      const sheet = JSON.parse(readFileSync(`${root}/${name}`, 'utf8'));
      const issues = checkSheet(sheet);
      if (issues.length) throw Error(issues.join('; '));
      const meta = sheet.meta, t = meta.thornvael;
      if (name !== `${t.unit}.json`) throw Error('filename does not match unit id');
      for (const file of [name, meta.image, t.mask]) {
        if (!files.includes(file)) throw Error(`missing exact-case file ${file}`);
        seen.add(file);
        const entry = manifest.find((a) => a.path === `${root}/${file}`);
        if (!entry || entry.license !== 'own' || !entry.source || !entry.note) throw Error(`missing generated-art provenance: ${file}`);
      }
      const color = decodePng(readFileSync(`${root}/${meta.image}`));
      const mask = decodePng(readFileSync(`${root}/${t.mask}`));
      if ([color, mask].some((im) => im.w !== meta.size.w || im.h !== meta.size.h)) throw Error('PNG dimensions differ from metadata');
      const channels = [0, 0, 0];
      const animationHashes = new Map();
      for (const [key, { frame: r }] of Object.entries(sheet.frames)) {
        let opaque = 0, marked = 0;
        const hash = createHash('sha256');
        for (let y = r.y; y < r.y + r.h; y++) hash.update(color.pixels.subarray((y * color.w + r.x) * 4, (y * color.w + r.x + r.w) * 4));
        const sequence = key.slice(0, key.lastIndexOf('/'));
        if (!animationHashes.has(sequence)) animationHashes.set(sequence, new Set());
        animationHashes.get(sequence).add(hash.digest('hex'));
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
          const p = (y * color.w + x) * 4;
          if (color.pixels[p + 3]) opaque++;
          if (mask.pixels[p + 3] > 128) {
            marked++;
            if (!color.pixels[p + 3]) throw Error(`${key}: mask outside colour silhouette`);
            for (let c = 0; c < 3; c++) if (mask.pixels[p + c] > 128) channels[c]++;
          }
        }
        if (!opaque || !marked) throw Error(`${key}: empty colour or mask frame`);
      }
      if (channels.some((n) => !n)) throw Error('RGB mask must contain all three palette regions');
      for (const [sequence, hashes] of animationHashes) if (hashes.size < 2) throw Error(`${sequence}: animation contains only repeated still frames`);
    } catch (error) { errors.push(`${root}/${name}: ${error.message}`); }
  }
  for (const unit of ['hero', 'archer', 'golem']) if (!files.includes(`${unit}.json`)) errors.push(`missing required unit ${unit}`);
  for (const file of files.filter((f) => f.endsWith('.png'))) if (!seen.has(file)) errors.push(`orphan atlas image ${file}`);
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = checkAtlasFiles();
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Atlas contract, PNG pixels and provenance passed.');
}
