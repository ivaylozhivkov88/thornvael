// usage: node tools/ingest-item-image.mjs <src.png> <key>   key like weapon--fen-poachers-yew
import sharp from 'sharp';
import fs from 'node:fs';
const [src, key] = process.argv.slice(2);
const slug = key.split('--')[1];
fs.mkdirSync('.planning/gemini-results/doll-layers', { recursive: true });
const trimmed = await sharp(src).trim({ threshold: 10 }).toBuffer();
fs.writeFileSync(`.planning/gemini-results/doll-layers/${key}.png`, trimmed);
const icon = await sharp(trimmed).resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
fs.writeFileSync(`public/itemicons/${slug}.png`, icon);
console.log('ok', slug);
