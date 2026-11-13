// Writes public/chapter1-manifest.json: every data file and sound that Chapter 1 needs offline, with its size.
// The maps are bundled into the game code, so the code precache already covers them.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const files = [];
for (const [dir, ext] of [['data', '.json'], ['audio', '.m4a']]) {
  for (const name of readdirSync(join(root, dir)).sort()) {
    if (name.endsWith(ext)) {
      const fullPath = join(root, dir, name);
      let size;
      if (ext === '.json') {
        const text = readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n');
        size = Buffer.byteLength(text, 'utf8');
      } else {
        size = statSync(fullPath).size;
      }
      files.push({ path: `${dir}/${name}`, size });
    }
  }
}
const manifest = { id: 'ch1', cache: 'thornvael-ch1-v1', total: files.reduce((a, f) => a + f.size, 0), files };
writeFileSync(join(root, 'chapter1-manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`chapter1-manifest.json: ${files.length} files, ${manifest.total} bytes`);
