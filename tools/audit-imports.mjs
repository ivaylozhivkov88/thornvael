import fs from 'node:fs';
import path from 'node:path';

function walk(dir) {
  let results = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) results.push(...walk(full));
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) results.push(full);
  }
  return results;
}

const all = walk('src');
const dirs = ['src/fx', 'src/items', 'src/skills', 'src/sim/ai'];

for (const d of dirs) {
  const normD = d.replace(/\//g, path.sep);
  console.log(`=== Checking ${d} ===`);
  const filesInD = fs.readdirSync(d).filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
  for (const f of filesInD) {
    const base = f.replace(/\.tsx?$/, '');
    const importers = [];
    for (const file of all) {
      if (file.startsWith(normD)) continue;
      const content = fs.readFileSync(file, 'utf8');
      const targetSub = d.replace('src/', '');
      if (content.includes(`/${targetSub}/${base}`) || content.includes(`/${targetSub}'`) || content.includes(`/${targetSub}"`) || (base === 'index' && content.includes(`/${targetSub}`))) {
        importers.push(file);
      }
    }
    console.log(`${f}: imported by ${importers.length} external files ${importers.length ? '(' + importers.map(p => path.basename(p)).join(', ') + ')' : '[UNIMPORTED]'}`);
  }
}
