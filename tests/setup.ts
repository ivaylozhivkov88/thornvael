import { readFileSync } from 'node:fs';
import { installData } from '../src/sim/data';

// The sim reads its item and spell tables from public/data, the same files the browser fetches.
const read = (name: string): unknown => JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url), 'utf8'));
installData({ items: read('items'), spells: read('spells') });
