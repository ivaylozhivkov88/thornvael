// Writes public/chapter1-manifest.json: Chapter 1 data, audio (including audio/voices/**), sprites, portraits, doll layers, loadscreens, story slides, and icons.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const files = [];

function walk(relDir, exts) {
  const abs = join(root, relDir);
  if (!existsSync(abs)) return;
  for (const entry of readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = posix.join(relDir, entry.name);
    if (entry.isDirectory()) {
      walk(rel, exts);
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      const fullPath = join(root, rel);
      const size = entry.name.endsWith('.json')
        ? Buffer.byteLength(readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n'), 'utf8')
        : statSync(fullPath).size;
      files.push({ path: rel, size });
    }
  }
}

walk('data', ['.json']);
walk('audio', ['.m4a']);
walk('sprites', ['.png', '.json']);
walk('townart/portraits', ['.png', '.jpg', '.webp']);
walk('townart/doll', ['.png', '.jpg', '.webp']);
walk('townart', ['.png', '.jpg', '.webp']);
walk('loadscreens', ['.png', '.jpg', '.webp']);
walk('itemicons', ['.png']);
walk('spellicons', ['.png', '.json']);
walk('terrain', ['.png', '.json']);

// Deduplicate paths (since townart/** walks subdirs already added cleanly, keep sorted unique entries)
const uniq = new Map();
for (const f of files) uniq.set(f.path, f);
const sorted = [...uniq.values()].sort((a, b) => a.path.localeCompare(b.path));
const manifest = { id: 'ch1', cache: 'thornvael-ch1-v1', total: sorted.reduce((a, f) => a + f.size, 0), files: sorted };
writeFileSync(join(root, 'chapter1-manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`chapter1-manifest.json: ${sorted.length} files, ${manifest.total} bytes`);
