// Usage: node tools/merge-gemini-wiki.mjs <pasted-replies.txt>
// Extracts every {"id":{summary,flavor}} object from pasted Gemini replies, validates, writes .planning/gemini/wiki-overrides.json
import fs from 'node:fs';
const txt = fs.readFileSync(process.argv[2], 'utf8');
const out = {}; let i = 0, depth = 0, start = -1, inStr = false, esc = false;
for (i = 0; i < txt.length; i++) {
  const ch = txt[i];
  if (inStr) { if (esc) esc = false; else if (ch === String.fromCharCode(92)) esc = true; else if (ch === '"') inStr = false; continue; }
  if (ch === '"') { inStr = true; continue; }
  if (ch === '{') { if (depth++ === 0) start = i; }
  else if (ch === '}' && --depth === 0 && start >= 0) {
    try { Object.assign(out, JSON.parse(txt.slice(start, i + 1))); } catch (e) { console.log('bad block at', start, e.message); }
    start = -1;
  }
}
const all = {}; for (const f of fs.readdirSync('src/wiki/data')) if (f.endsWith('.json') && f !== 'index.json') { const a = JSON.parse(fs.readFileSync('src/wiki/data/' + f)); if (Array.isArray(a)) for (const e of a) all[e.id] = e; }
const bad = [], ok = {};
for (const [id, v] of Object.entries(out)) {
  if (!all[id]) { bad.push(id + ': unknown id'); continue; }
  const s = v?.summary, f = v?.flavor;
  if (typeof s !== 'string' || s.length < 40 || s.length > 170) bad.push(id + ': summary length ' + s?.length);
  else if (typeof f !== 'string' || f.length < 150 || f.length > 500) bad.push(id + ': flavor length ' + f?.length);
  else ok[id] = { summary: s, flavor: f };
}
fs.writeFileSync('.planning/gemini/wiki-overrides.json', JSON.stringify(ok, null, 1));
console.log('parsed', Object.keys(out).length, 'valid', Object.keys(ok).length, 'problems', bad.length);
bad.slice(0, 30).forEach((b) => console.log(' ', b));
