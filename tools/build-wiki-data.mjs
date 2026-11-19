// Builds the wiki data from the game's own tables. Single source of truth = the game.
//   node tools/build-wiki-data.mjs          writes src/wiki/data/*.json and tools/WIKI-MISSING-IMAGES.md
//   import { buildWikiData }                used by tests/wiki-data.test.ts to compare in memory
// Never invents text: lore comes from the content/text packs, otherwise the entry shows "No lore yet."
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const P = (...a) => join(ROOT, ...a);

// Allow Node (outside Vitest) to import TypeScript modules from src/ without modifying them.
if (!process.env.VITEST && !globalThis.__thornvaelWikiTsHook) {
  globalThis.__thornvaelWikiTsHook = true;
  const { transformSync } = await import('rolldown/experimental');
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) && context.parentURL?.startsWith('file:')) {
        const dir = dirname(fileURLToPath(context.parentURL));
        const ts = resolve(dir, specifier + '.ts');
        if (existsSync(ts)) return nextResolve(pathToFileURL(ts).href, context);
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (url.startsWith('file:') && url.endsWith('.ts')) {
        const file = fileURLToPath(url);
        const out = transformSync(file, readFileSync(file, 'utf8'), { lang: 'ts' });
        return { format: 'module', source: out.code, shortCircuit: true };
      }
      return nextLoad(url, context);
    },
  });
}

const [combatMod, suMod, runesMod, setsMod, d2Mod, affixMod, itemsMod, diffMod, mapGenMod] = await Promise.all([
  import('../src/sim/combat.ts'),
  import('../src/sim/super-uniques.ts'),
  import('../src/sim/runes.ts'),
  import('../src/sim/sets.ts'),
  import('../src/sim/d2-database.ts'),
  import('../src/sim/affixes.ts'),
  import('../src/sim/items.ts'),
  import('../src/sim/difficulty.ts'),
  import('../src/map-generator.ts'),
]);

const readJson = (rel, fallback = null) => {
  try {
    return JSON.parse(readFileSync(P(rel), 'utf8'));
  } catch {
    return fallback;
  }
};
const has = (rel) => existsSync(P('public', rel));
const slug = (s) => String(s).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cap = (s) => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : '');
const C = (n) => readJson(`public/data/content/${n}.json`, []);
const uniqBy = (arr, key) => {
  const seen = new Set();
  return arr.filter((x) => (seen.has(x[key]) ? false : (seen.add(x[key]), true)));
};

const STAT = {
  body: 'Body',
  agility: 'Agility',
  mind: 'Mind',
  spirit: 'Spirit',
  accuracy: 'Accuracy',
  lifesteal: 'Life steal',
  manasteal: 'Mana steal',
  armor: 'Armor',
  def: 'Defense',
  abs: 'Absorption',
  dmg: 'Damage',
  crit_pct: 'Crit %',
  block_pct: 'Block %',
  hp: 'Max HP',
  mana: 'Max Mana',
  pow: 'Spell Power %',
  mf: 'Magic Find %',
  gold: 'Gold Find %',
};
const statName = (s) => STAT[s] ?? cap(String(s).replace(/_pct$/, ' %').replace(/_/g, ' '));
const fmtStats = (o) => Object.entries(o ?? {}).map(([k, v]) => `${Number(v) > 0 ? '+' : ''}${v} ${statName(k)}`);
const CLASS_LABEL = { warrior: 'Warrior', archer: 'Archer', mage: 'Mage', necromancer: 'Necromancer' };
const SLOT_NAME = ['Weapon', 'Shield', 'Helm', 'Armor', 'Boots', 'Ring', 'Amulet', 'Gloves'];
const ELEM_NAME = ['Physical', 'Fire', 'Water', 'Air', 'Earth', 'Astral'];
const CLS_FROM_MASK = (m) => (m === 1 ? 'Warrior' : m === 2 ? 'Mage' : m === 3 ? 'All' : m === 4 ? 'Archer' : m === 8 ? 'Necromancer' : 'All');

export function buildWikiData() {
  const missing = []; // { id, type, where }
  function pic(type, id, where, ...candidates) {
    for (const c of candidates) if (c && has(c)) return { src: c };
    missing.push({ id, type, where });
    return null;
  }

  const out = {};
  const campaign = readJson('public/data/campaign.json', { nodes: [] });
  const nodes = campaign.nodes;
  const missionNodes = nodes.filter((n) => n.kind === 'mission');
  const nodeByPrefix = (m) => missionNodes.find((n) => n.id.startsWith(m + '-'));
  const missionOf = (m) => nodeByPrefix(m);
  const actOfNode = {};
  for (const n of nodes) actOfNode[n.id] = n.act;

  // ---------- bestiary ----------
  const mons = readJson('public/data/monsters.json', { families: [], bosses: [], palettes: [] });
  const best52 = readJson('public/data/text/bestiary-52.json', { entries: [] }).entries;
  const codex = Object.fromEntries(C('monster-codex').map((c) => [c.id, c]));
  const extra = C('bestiary-extra');
  const statsOf = Object.fromEntries([...mons.families, ...mons.bosses].map((m) => [m.id, m]));
  const kindDefs = Object.fromEntries(combatMod.DEFS.map((d) => [d.name.toLowerCase(), d]));
  const rosters = readJson('public/data/content/mission-rosters.json', { mission_rosters: [] }).mission_rosters;
  const foundIn = {};
  for (const r of rosters) {
    for (const f of [...r.families, r.boss].filter(Boolean)) (foundIn[f] ??= []).push(r.mission);
  }
  const foundBiomes = {};
  for (const [bName, cfg] of Object.entries(mapGenMod.BIOMES)) {
    const fams = new Set([...(cfg.mobFamilies ?? []), cfg.mobFamily, ...(cfg.bossFamilies ?? []), cfg.bossFamily].filter(Boolean));
    for (const f of fams) (foundBiomes[f] ??= []).push(bName);
  }

  const uniques = [...C('uniques'), ...C('uniques-2'), ...C('uniques-3')];
  const dropsOf = {};
  for (const u of uniques) if (u.drop_from) (dropsOf[u.drop_from] ??= []).push(u.id);
  const bossInfo = readJson('public/data/content/bosses.json', {});
  const bossExtra = Object.fromEntries((readJson('public/data/content/boss-extra.json', { boss_extra: [] }).boss_extra ?? []).map((b) => [b.boss, b]));
  const atlasCache = {};
  const atlasPic = (id) => {
    if (!has(`sprites/${id}.json`) || !has(`sprites/${id}.png`)) return null;
    const j = (atlasCache[id] ??= readJson(`public/sprites/${id}.json`));
    const f = j?.frames?.[`${id}/stand/00/00`] ?? Object.values(j?.frames ?? {})[0];
    if (!f) return null;
    return { src: `sprites/${id}.png`, atlas: { x: f.frame.x, y: f.frame.y, w: f.frame.w, h: f.frame.h, sw: j.meta.size.w, sh: j.meta.size.h } };
  };
  const portraitFor = (id) => {
    for (const c of [`townart/mon/${id}.jpg`, `townart/frame-${id}.jpg`, `townart/friend-${id}.jpg`, `townart/frame-hero-${id}.jpg`]) {
      if (has(c)) return { src: c };
    }
    return null;
  };

  const firstMission = (id) => (foundIn[id] ?? [])[0];
  const bestiary = [];
  const PLAYER_SIDE = new Set(['archer', 'mage', 'warrior', 'imp', 'golem']);

  for (const b of best52) {
    const s = statsOf[b.id];
    const kd = !s ? kindDefs[b.id] : null;
    const baseHp = s?.baseHp ?? kd?.hp;
    const baseMin = s?.baseMin ?? kd?.min;
    const baseMax = s?.baseMax ?? kd?.max;
    const speed = s?.speed ?? kd?.speed;
    const attackKind = s ? (s.caster ? 'Spell' : s.ranged ? 'Ranged' : 'Melee') : kd ? (kd.caster ? 'Spell' : kd.ranged ? 'Ranged' : 'Melee') : undefined;
    const cx = codex[b.id];
    const isBoss = mons.bosses.some((m) => m.id === b.id);
    const whereMissions = (foundIn[b.id] ?? []).map((m) => missionOf(m)).filter(Boolean);
    const whereBiomes = foundBiomes[b.id] ?? [];

    const sections = [];
    if (b.lore) sections.push({ h: 'Lore', p: [b.lore] });
    if (cx?.codex) sections.push({ h: 'Field notes', p: [cx.codex] });
    if (cx?.special) {
      const spDesc = typeof cx.special === 'string' ? [cx.special] : [cx.special.desc, cx.special.telegraph].filter(Boolean);
      const spTitle = typeof cx.special === 'string' ? 'Special ability' : cx.special.name ?? 'Special ability';
      if (spDesc.length) sections.push({ h: spTitle, p: spDesc });
    }
    if (cx?.loot_theme) sections.push({ h: 'Loot theme', p: [cx.loot_theme] });
    const boss = bossInfo[b.id];
    const bEx = bossExtra[b.id];
    if (boss?.title) sections.push({ h: 'Title', p: [boss.title] });
    if (bEx) sections.push({ h: 'Battle quotes', list: [bEx.big_hit, bEx.enrage, bEx.hero_down].filter(Boolean) });
    if (!b.lore && !cx) sections.push({ h: 'Lore', p: ['No lore yet.'] });

    if (baseHp != null && baseMin != null && baseMax != null && mons.palettes.length) {
      sections.push({
        h: 'Strength by tier',
        table: {
          head: ['Tier', 'Palette', 'HP', 'Damage'],
          rows: mons.palettes.map((p) => [
            String(p.tier),
            p.label,
            String(Math.round(baseHp * p.hpMult)),
            `${Math.round(baseMin * p.dmgMult)}-${Math.round(baseMax * p.dmgMult)}`,
          ]),
        },
      });
    }
    if (whereMissions.length || whereBiomes.length) {
      sections.push({
        h: 'Where found',
        list: [
          ...whereMissions.map((n) => `Campaign: ${n.title} (Act ${n.act})`),
          ...whereBiomes.map((bm) => `Skirmish biome: ${cap(bm)}`),
        ],
      });
    }

    const drops = (dropsOf[b.id] ?? []).map((u) => `unique/${u}`);
    if (drops.length) {
      const dropNames = drops.map((r) => uniques.find((u) => `unique/${u.id}` === r)?.name).filter(Boolean);
      sections.push({ h: 'Signature drops', list: dropNames });
    }

    const portrait = portraitFor(b.id);
    const sprite = atlasPic(b.id);
    const img = portrait ?? sprite ?? pic('bestiary', b.id, 'infobox/portrait');

    bestiary.push({
      id: b.id,
      type: 'bestiary',
      title: b.name,
      summary: s?.role ?? (PLAYER_SIDE.has(b.id) ? 'Playable or allied unit.' : `${cap(kd?.name ?? b.name)} unit.`),
      img,
      ...(portrait && sprite ? { sprite } : {}),
      infobox: [
        ['Kind', isBoss ? 'Boss' : PLAYER_SIDE.has(b.id) ? 'Hero-side unit' : 'Creature'],
        ...(baseHp != null ? [['Base HP', String(baseHp)], ['Damage', `${baseMin}-${baseMax}`], ['Speed', String(speed)], ['Attack', attackKind ?? 'Melee']] : []),
        ...(s?.elem ? [['Element', ELEM_NAME[s.elem] ?? String(s.elem)]] : []),
        ['Weakness', b.weakness || cx?.weakness || 'Unknown'],
        ['Found in', whereMissions.length ? whereMissions.slice(0, 3).map((n) => n.title).join(', ') + (whereMissions.length > 3 ? ` +${whereMissions.length - 3}` : '') : whereBiomes.length ? whereBiomes.map(cap).join(', ') : 'Unknown'],
      ],
      sections,
      related: [...drops, ...whereMissions.slice(0, 4).map((n) => `mission/${n.id}`), ...whereBiomes.map((bm) => `biome/${bm}`)],
      tags: {
        family: isBoss ? 'boss' : PLAYER_SIDE.has(b.id) ? 'ally' : 'creature',
        level: baseHp ? Math.round(baseHp / 10) : 0,
        act: actOfNode[missionOf(firstMission(b.id))?.id] ?? 0,
        core: true,
      },
      gate: firstMission(b.id) ? { m: firstMission(b.id) } : undefined,
    });
  }

  // Super-Unique bosses from src/sim/super-uniques.ts
  for (const su of suMod.SUPER_UNIQUES) {
    const id = `su-${su.id}`;
    const portrait = portraitFor(su.family);
    const sprite = atlasPic(su.family);
    const img = portrait ?? sprite ?? pic('bestiary', id, 'infobox/portrait');
    bestiary.push({
      id,
      type: 'bestiary',
      title: su.name,
      summary: `${su.title} · Act ${su.act} Super Unique`,
      img,
      ...(portrait && sprite ? { sprite } : {}),
      infobox: [
        ['Kind', 'Super Unique'],
        ['Act', String(su.act)],
        ['Base family', su.family],
        ['Tier', String(su.tier)],
        ['Element', ELEM_NAME[su.elem] ?? 'Physical'],
        ['Modifiers', su.mods.map((m) => cap(m.replace(/_/g, ' '))).join(', ')],
        ['Retinue', `${su.retinue.count}x ${su.retinue.family} (T${su.retinue.tier})`],
      ],
      sections: [
        { h: 'Overview', p: [su.summary] },
        { h: 'Signature abilities', list: [...su.signatureAbilities] },
        { h: 'Lore', p: ['No lore yet.'] },
      ],
      related: [`bestiary/${su.family}`, `map/map${su.act}`],
      tags: { family: 'super-unique', level: su.tier * 12, act: su.act, core: false },
      gate: { a: su.act },
    });
  }

  const EXTRA_BESTIARY_ART = {
    'peat-leech-matron': { sprite: 'maggot-swarm' },
    'alder-gnoll-skirmisher': { sprite: 'gnoll' },
    'tollhouse-ghoul': { sprite: 'hollow-knight' },
    'weir-pike-stalker': { sprite: 'lantern-eel' },
    'bog-tallow-wight': { sprite: 'greater-mummy' },
    'slate-cliff-harpy': { sprite: 'storm-kite' },
    'charcoal-imp': { sprite: 'imp' },
    'bramble-stag': { sprite: 'gloom-stag' },
    'ditch-rat-pack': { sprite: 'ruin-mite' },
    'parish-debt-shade': { sprite: 'mire-wisp' },
    'quarry-chert-crawler': { sprite: 'flintback' },
    'ashbrook-scarecrow': { sprite: 'night-orchard' },
    'mire-toad-bloater': { sprite: 'spore-matron' },
    'undervault-rust-slug': { sprite: 'pale-burrower' },
    'gnoll-torchbearer': { sprite: 'gnoll' },
    'alkali-dust-devil': { sprite: 'mire-wisp' },
    'salt-viper-spitter': { sprite: 'claw-viper' },
    'quarry-chain-revenant': { sprite: 'hollow-knight' },
    'wardstone-spark-wisp': { sprite: 'mire-wisp' },
    'sand-clan-outrider': { sprite: 'sand-raider' },
    'canopic-jackal-guard': { sprite: 'greater-mummy' },
    'brine-scale-basilisk': { sprite: 'dune-beast' },
    'redrock-sling-bandit': { sprite: 'sand-raider', portrait: 'townart/portraits/merc-redmarsh-slinger.jpg' },
    'silt-leech-colony': { sprite: 'maggot-swarm' },
    'hex-cairn-sentinel': { sprite: 'golem' },
    'dune-scorpion-stalker': { sprite: 'dune-scarab' },
    'embalmed-scribe': { sprite: 'greater-mummy', portrait: 'townart/portraits/merc-tomb-notary.jpg' },
    'ironheart-crossbowman': { sprite: 'archer', portrait: 'townart/portraits/merc-harbor-arbalest.jpg' },
    'mirage-weaver-jackal': { sprite: 'dune-beast' },
    'tar-pit-crawler': { sprite: 'pale-burrower' },
    'kelp-wrapped-drowned': { sprite: 'hollow-knight' },
    'harbor-privateer': { sprite: 'sand-raider', portrait: 'townart/portraits/merc-oakhaven-marine.jpg' },
    'razor-gull-flock': { sprite: 'storm-kite' },
    'barnacle-shell-golem': { sprite: 'silt-colossus' },
    'sea-cave-lurker': { sprite: 'dune-lurker' },
    'oakhaven-turncoat-adept': { sprite: 'mage', portrait: 'townart/portraits/merc-lantern-novice.jpg' },
    'wreck-hull-mimic': { sprite: 'flintback' },
    'brine-phantom': { sprite: 'frost-bell' },
    'fumarole-cinder-crab': { sprite: 'salt-crab' },
    'black-fleet-marine': { sprite: 'warrior', portrait: 'townart/portraits/merc-oakhaven-marine.jpg' },
    'siren-buoy-bell': { sprite: 'frost-bell' },
    'gallows-crow-matriarch': { sprite: 'storm-kite' },
    'floodgate-rust-hound': { sprite: 'briar-hound' },
    'tidal-undine-wraith': { sprite: 'mire-wisp' },
    'catacomb-ghast': { sprite: 'wendigo-bruiser' },
    'slag-vein-hound': { sprite: 'cinderhorn' },
    'ember-court-inquisitor': { sprite: 'ash-weaver', portrait: 'townart/portraits/merc-drowned-arbiter.jpg' },
    'obsidian-gargoyle': { sprite: 'redglass-drake' },
    'caldera-ash-wraith': { sprite: 'ash-weaver' },
    'magnetic-iron-golem': { sprite: 'golem' },
    'cinder-vanguard-halberdier': { sprite: 'doom-knight', portrait: 'townart/portraits/merc-ironcamp-halberdier.jpg' },
    'fissure-wyvern': { sprite: 'redglass-drake' },
    'penitent-flagellant': { sprite: 'fallen-shaman', portrait: 'townart/portraits/merc-penitent-flagellant.jpg' },
    'void-rift-stalker': { sprite: 'rift-moth' },
    'magma-slug-behemoth': { sprite: 'pale-burrower' },
    'threshold-sentinel': { sprite: 'basalt-brute' },
    'soot-lung-leech': { sprite: 'maggot-swarm' },
    'balefire-pyromancer': { sprite: 'cinder-shaman', portrait: 'townart/portraits/merc-ash-battlemage.jpg' },
    'anchor-chain-specter': { sprite: 'hollow-king' },
    'redglass-hatchling': { sprite: 'redglass-drake' },
  };

  for (const e of extra) {
    const art = EXTRA_BESTIARY_ART[e.id];
    const portrait =
      portraitFor(e.id) ??
      (art?.portrait && has(art.portrait) ? { src: art.portrait } : null) ??
      (art?.sprite ? portraitFor(art.sprite) : null);
    const sprite = (art?.sprite ? atlasPic(art.sprite) : null) ?? atlasPic(e.id);
    const img = portrait ?? sprite ?? pic('bestiary', e.id, 'infobox/portrait', `townart/mon/${e.id}.jpg`);
    bestiary.push({
      id: e.id,
      type: 'bestiary',
      title: e.name,
      summary: e.behavior,
      img,
      ...(portrait && sprite ? { sprite } : {}),
      infobox: [
        ['Kind', 'Creature (Field)'],
        ['Family', cap(e.family)],
        ...(art?.sprite ? [['Sprite family', cap(art.sprite.replace(/-/g, ' '))]] : []),
        ['Act', String(e.act)],
        ['Weakness', cap(e.weakness)],
      ],
      sections: [{ h: 'Behavior', p: [e.behavior] }, { h: 'Lore', p: [e.lore || 'No lore yet.'] }],
      related: [`map/map${e.act}`, ...(art?.sprite ? [`bestiary/${art.sprite}`] : [])],
      tags: { family: e.family, level: e.act * 5, act: e.act, core: false },
      gate: { a: e.act },
    });
  }
  out.bestiary = uniqBy(bestiary, 'id');

  // ---------- items, uniques, sets, affixes, gems/runes ----------
  const itemEntries = [];
  const iconFor = (type, id, name, where, ...extraSlugs) =>
    pic(
      type,
      id,
      where,
      ...extraSlugs.filter(Boolean).map((s) => `itemicons/${s}.png`),
      `itemicons/${slug(name)}.png`,
    );

  const gearList = readJson('public/data/items.json', { items: [] }).items;
  const itemLore = readJson('src/data/text/item-lore.json', {});
  const loreOf = (key) => Object.keys(itemLore).filter((k) => k === key || k.startsWith(key + '.')).map((k) => itemLore[k]);

  for (const it of gearList) {
    const id = slug(it.name);
    const inf = [['Type', cap(it.kind)], ['Tier', String(it.tier)], ['Weight', String(it.w)]];
    if (it.slot) inf.push(['Slot', cap(it.slot)]);
    if (it.cls) inf.push(['Class', cap(it.cls)]);
    if (it.min != null) inf.push(['Damage', `${it.min}-${it.max}`]);
    if (it.need) inf.push(['Requires', `${cap(it.need)} ${it.needv}`]);
    if (it.heal) inf.push(['Heals', String(it.heal)]);
    for (const k of ['armor', 'block', 'acc', 'hp', 'mana']) if (it[k] != null) inf.push([cap(k), String(it[k])]);
    itemEntries.push({
      id,
      type: 'item',
      title: it.name,
      summary: `${cap(it.kind)}${it.slot ? ' · ' + it.slot : ''} · tier ${it.tier}`,
      img: iconFor('item', id, it.name, 'infobox/icon'),
      infobox: inf,
      sections: [{ h: 'Description', p: ['No lore yet.'] }],
      related: [],
      tags: { rarity: 'common', level: it.tier, slot: it.slot ?? it.kind, cls: it.cls ?? '' },
    });
  }
  for (const b of C('base-items')) {
    const id = 'base-' + b.id;
    itemEntries.push({
      id,
      type: 'item',
      title: b.name,
      summary: `Base item · ${b.slot} · tier ${b.tier}`,
      img: iconFor('item', id, b.name, 'infobox/icon', b.id),
      infobox: [['Type', 'Base item'], ['Slot', cap(b.slot)], ['Tier', String(b.tier)], ['Class', cap(b.class_hint)]],
      sections: [{ h: 'Description', p: [b.flavor || 'No lore yet.'] }],
      related: [],
      tags: { rarity: 'base', level: b.tier, slot: b.slot, cls: b.class_hint ?? '' },
    });
  }
  // Sim D2 base items & endgame keys
  for (const b of d2Mod.BASE_ITEMS) {
    const id = 'sim-' + slug(b.id);
    if (itemEntries.some((x) => x.title.toLowerCase() === b.name.toLowerCase())) continue;
    const slotLabel = b.charmSize ? `${cap(b.charmSize)} Charm` : b.beltSlots ? 'Belt' : SLOT_NAME[b.slot] ?? 'Gear';
    const inf = [['Type', 'Base item'], ['Slot', slotLabel], ['Tier', String(b.tier)], ['Max sockets', String(b.maxSockets)]];
    if (b.minDmg != null) inf.push(['Damage', `${b.minDmg}-${b.maxDmg}`]);
    if (b.def != null) inf.push(['Defense', String(b.def)]);
    if (b.abs != null) inf.push(['Absorption', String(b.abs)]);
    if (b.beltSlots) inf.push(['Potion slots', String(b.beltSlots)]);
    if (b.reqStr || b.reqDex) inf.push(['Requires', [b.reqStr ? `Body ${b.reqStr}` : '', b.reqDex ? `Agility ${b.reqDex}` : ''].filter(Boolean).join(', ')]);
    itemEntries.push({
      id,
      type: 'item',
      title: b.name,
      summary: `Base ${slotLabel} · tier ${b.tier}`,
      img: iconFor('item', id, b.name, 'infobox/icon', b.id),
      infobox: inf,
      sections: [{ h: 'Description', p: ['No lore yet.'] }],
      related: [],
      tags: { rarity: 'base', level: b.tier, slot: slotLabel.toLowerCase(), cls: '' },
    });
  }
  for (const sp of itemsMod.SPECIAL_ITEMS) {
    const id = slug(sp.name);
    if (itemEntries.some((x) => x.id === id)) continue;
    itemEntries.push({
      id,
      type: 'item',
      title: sp.name,
      summary: `Special item · tier ${sp.tier}`,
      img: iconFor('item', id, sp.name, 'infobox/icon'),
      infobox: [['Type', 'Special'], ['Tier', String(sp.tier)], ['Weight', String(sp.w)]],
      sections: [{ h: 'Description', p: [sp.lore || 'No lore yet.'] }],
      related: [],
      tags: { rarity: sp.rarity ?? 'common', level: sp.tier, slot: 'special', cls: '' },
    });
  }
  out.items = uniqBy(itemEntries, 'id');

  const uniqueEntries = [];
  for (const u of uniques) {
    const id = u.id;
    const lore = loreOf(`item.unique.${id}.lore`);
    const stats = u.mods ? u.mods.map((m) => `${m.value > 0 ? '+' : ''}${m.value} ${statName(m.stat)}`) : fmtStats(u.stats);
    const sections = [
      ...(u.quirk ? [{ h: 'Quirk', p: [u.quirk] }] : []),
      ...[u.lore, u.flavor, u.inspect].filter(Boolean).map((t, i) => ({ h: i === 0 ? 'Lore' : 'Inspect', p: [t] })),
      ...(lore.length ? [{ h: 'Chronicle lore', p: lore }] : []),
    ];
    if (!sections.length) sections.push({ h: 'Lore', p: ['No lore yet.'] });
    uniqueEntries.push({
      id,
      type: 'unique',
      title: u.name,
      summary: `Unique ${u.base} · ${cap(u.cls ?? u.class)}`,
      img: iconFor('unique', id, u.name, 'infobox/icon', id, u.base ? slug(u.base) : ''),
      infobox: [
        ['Rarity', 'Unique'],
        ['Base', u.base],
        ['Class', cap(u.cls ?? u.class)],
        ['Act / Tier', String(u.act ?? u.tier ?? '')],
        ...(u.drop_from ? [['Dropped by', u.drop_from]] : []),
        ...stats.map((s) => ['Stat', s]),
      ],
      sections,
      related: u.drop_from && statsOf[u.drop_from] ? [`bestiary/${u.drop_from}`] : [],
      tags: { rarity: 'unique', level: u.act ?? u.tier ?? 0, slot: '', cls: u.cls ?? u.class ?? '', act: u.act ?? u.tier ?? 0 },
      gate: u.drop_from && firstMission(u.drop_from) ? { m: firstMission(u.drop_from) } : { a: u.act ?? u.tier ?? 1 },
    });
  }
  out.uniques = uniqBy(uniqueEntries, 'id');

  const jsonSets = [...C('item-sets'), ...C('item-sets-2')].map((s) => ({
    id: s.id,
    type: 'set',
    title: s.name,
    summary: `${cap(s.class)} set · ${s.pieces.length} pieces`,
    img: pic('set', s.id, 'infobox/icon', ...s.pieces.map((p) => `itemicons/${slug(p.name)}.png`)),
    infobox: [['Class', cap(s.class)], ['Pieces', String(s.pieces.length)]],
    sections: [
      { h: 'Pieces', list: s.pieces.map((p) => `${p.name} (${p.base})`) },
      { h: 'Set bonuses', list: Object.entries(s.bonuses ?? {}).map(([n, t]) => `${n} pieces: ${t}`) },
      { h: 'Lore', p: [s.lore || 'No lore yet.'] },
    ],
    related: [],
    tags: { rarity: 'set', level: s.pieces.length, cls: s.class },
  }));
  const simSets = setsMod.ALL_SETS.map((s) => {
    const id = 'sim-' + slug(s.id);
    const cls = s.pieces[0] ? CLS_FROM_MASK(s.pieces[0].cls) : 'All';
    const fmtBonus = (b) => {
      const parts = [];
      if (b.hp) parts.push(`+${b.hp} HP`);
      if (b.mana) parts.push(`+${b.mana} Mana`);
      if (b.def) parts.push(`+${b.def} Def`);
      if (b.abs) parts.push(`+${b.abs} Abs`);
      if (b.acc) parts.push(`+${b.acc} Acc`);
      if (b.min || b.max) parts.push(`+${b.min ?? 0}-${b.max ?? 0} Damage`);
      if (b.pow) parts.push(`+${b.pow}% Spell Power`);
      if (b.res?.some((x) => x > 0)) parts.push(`Resists ${b.res.join('/')}`);
      return `${b.pieces} pieces: ${parts.join(', ')}`;
    };
    return {
      id,
      type: 'set',
      title: s.name,
      summary: `${cls} set · ${s.pieces.length} pieces`,
      img: pic('set', id, 'infobox/icon', ...s.pieces.map((p) => `itemicons/${slug(p.name)}.png`)),
      infobox: [['Class', cls], ['Pieces', String(s.pieces.length)]],
      sections: [
        { h: 'Pieces', list: s.pieces.map((p) => `${p.name} (${SLOT_NAME[p.slot] ?? 'Gear'}, T${p.tier})${p.lore ? ` — ${p.lore}` : ''}`) },
        { h: 'Set bonuses', list: s.bonuses.map(fmtBonus) },
      ],
      related: [],
      tags: { rarity: 'set', level: s.pieces.length, cls: cls.toLowerCase() },
    };
  });
  out.sets = uniqBy([...jsonSets, ...simSets], 'id');

  const simAffixes = [...affixMod.MAGIC_PREFIXES, ...affixMod.MAGIC_SUFFIXES].map((a) => {
    const parts = [];
    if (a.min || a.max) parts.push(`+${a.min ?? 0}-${a.max ?? 0} Damage`);
    if (a.acc) parts.push(`+${a.acc} Acc`);
    if (a.def) parts.push(`+${a.def} Def`);
    if (a.abs) parts.push(`+${a.abs} Abs`);
    if (a.hp) parts.push(`+${a.hp} HP`);
    if (a.mana) parts.push(`+${a.mana} Mana`);
    if (a.pow) parts.push(`+${a.pow}% Power`);
    if (a.regen) parts.push(`+${a.regen} Regen`);
    return {
      id: `sim-${a.kind}-${slug(a.name)}`,
      name: a.name,
      kind: a.kind,
      slots: (a.slots ?? []).map((sl) => SLOT_NAME[sl] ?? 'Gear'),
      tier: `${a.tierMin}-${a.tierMax}`,
      tierNum: a.tierMin,
      line: parts.join(', ') || 'Elemental / Attribute bonus',
      flavor: '',
    };
  });
  const affixes = [
    ...C('affixes').map((a) => ({ id: a.id, name: a.name, kind: a.kind, slots: a.slots, tier: String(a.tier), tierNum: a.tier, line: `${statName(a.stat)} ${a.min}${a.max !== a.min ? '-' + a.max : ''}`, flavor: a.flavor })),
    ...C('affixes-2').map((a) => ({ id: a.id, name: a.name, kind: a.type, slots: a.slots, tier: String(a.tier), tierNum: a.tier, line: fmtStats(a.stats).join(', '), flavor: a.flavor })),
    ...simAffixes,
  ];
  out.affixes = uniqBy(
    affixes.map((a) => ({
      id: a.id,
      type: 'affix',
      title: a.name,
      summary: `${cap(a.kind)} · tier ${a.tier} · ${a.line}`,
      img: null,
      infobox: [['Kind', cap(a.kind)], ['Tier', a.tier], ['Effect', a.line], ['Slots', (a.slots ?? []).map(cap).join(', ') || 'All gear']],
      sections: [{ h: 'Description', p: [a.flavor || 'No lore yet.'] }],
      related: [],
      tags: { rarity: 'magic', level: a.tierNum, slot: (a.slots ?? [])[0]?.toLowerCase() ?? '', cls: '' },
    })),
    'id',
  );

  const fmtBonusObj = (b) => {
    if (!b) return '-';
    return Object.entries(b)
      .filter(([, v]) => v != null && v !== false)
      .map(([k, v]) => (Array.isArray(v) ? `${k}: ${v.join('/')}` : v === true ? k : `${k}: +${v}`))
      .join(', ') || '-';
  };
  const jsonGems = C('gems-runes').map((g) => ({
    id: g.id,
    type: 'gem',
    title: g.name,
    summary: `${cap(g.kind)} · tier ${g.tier}`,
    img: pic('gem', g.id, 'infobox/icon', `itemicons/${slug(g.name)}.png`),
    infobox: [['Kind', cap(g.kind)], ['Tier', String(g.tier)], ['In weapon', g.socket_effect?.weapon ?? '-'], ['In armor', g.socket_effect?.armor ?? '-'], ['Buy', String(g.buy)], ['Sell', String(g.sell)]],
    sections: [{ h: 'Description', p: [g.desc || 'No lore yet.'] }, ...(g.flavor ? [{ h: 'Lore', p: [g.flavor] }] : [])],
    related: [],
    tags: { rarity: 'socket', level: g.tier, slot: 'socket', cls: '' },
  }));
  const d2Gems = d2Mod.D2_GEMS.map((g) => {
    const id = 'gem-' + slug(g.name);
    return {
      id,
      type: 'gem',
      title: g.name,
      summary: `${cap(g.quality)} ${cap(g.type)} · tier ${g.tier}`,
      img: pic('gem', id, 'infobox/icon', `itemicons/${slug(g.name)}.png`),
      infobox: [
        ['Kind', 'Gem'],
        ['Quality', cap(g.quality)],
        ['Tier', String(g.tier)],
        ['In weapon', fmtBonusObj(g.weaponBonus)],
        ['In armor', fmtBonusObj(g.armorBonus)],
        ['In shield', fmtBonusObj(g.shieldBonus)],
      ],
      sections: [{ h: 'Description', p: [`Socketable ${g.quality} ${g.type} gem.`] }],
      related: [],
      tags: { rarity: 'socket', level: g.tier, slot: 'socket', cls: '' },
    };
  });
  const runeById = Object.fromEntries(runesMod.ALL_RUNES.map((r) => [r.id, r]));
  const simRunes = runesMod.ALL_RUNES.map((r) => {
    const id = 'rune-' + slug(r.name);
    return {
      id,
      type: 'gem',
      title: r.name,
      summary: `Rune #${r.id} · Req Lv ${r.clvl}`,
      img: pic('gem', id, 'infobox/icon', `itemicons/${slug(r.name)}.png`),
      infobox: [
        ['Kind', 'Rune'],
        ['Rank', String(r.id)],
        ['Required Level', String(r.clvl)],
        ['In weapon', fmtBonusObj(r.weaponBonus)],
        ['In armor', fmtBonusObj(r.armorBonus)],
        ['In shield', fmtBonusObj(r.shieldBonus)],
      ],
      sections: [{ h: 'Description', p: ['Socketable rune used individually or chained in runeword recipes.'] }],
      related: runesMod.RUNEWORDS.filter((rw) => rw.runeIds.includes(r.id)).slice(0, 5).map((rw) => `gem/rw-${rw.id}`),
      tags: { rarity: 'socket', level: r.clvl, slot: 'rune', cls: '' },
    };
  });
  const simRunewords = runesMod.RUNEWORDS.map((rw) => {
    const id = `rw-${rw.id}`;
    const recipeNames = rw.runeIds.map((rid) => runeById[rid]?.name ?? `Rune ${rid}`);
    const slotNames = rw.allowedSlots.map((sl) => SLOT_NAME[sl] ?? 'Gear').join(', ');
    return {
      id,
      type: 'gem',
      title: rw.name,
      summary: `Runeword (${recipeNames.join(' + ')}) · ${slotNames}`,
      img: null,
      infobox: [
        ['Kind', 'Runeword'],
        ['Runes', recipeNames.join(' → ')],
        ['Allowed slots', slotNames],
        ['Required Level', String(rw.clvl)],
      ],
      sections: [
        { h: 'Recipe order', list: recipeNames },
        { h: 'Runeword bonuses', list: fmtBonusObj(rw.stats).split(', ') },
      ],
      related: rw.runeIds.map((rid) => `gem/rune-${slug(runeById[rid]?.name ?? '')}`),
      tags: { rarity: 'runeword', level: rw.clvl, slot: 'runeword', cls: '' },
    };
  });
  out.gems = uniqBy([...jsonGems, ...d2Gems, ...simRunes, ...simRunewords], 'id');

  // ---------- spells & skills ----------
  const spFlavor = readJson('src/data/text/spell-flavor.json', {});
  const spText = Object.fromEntries(C('spell-text').map((t) => [t.name, t]));
  const spellsBase = readJson('public/data/spells.json', { spells: [] }).spells;
  const spellAll = [...spellsBase, ...C('spells-new')];
  const spIconFrames = readJson('public/spellicons/spellicons.json', { frames: {} }).frames ?? {};
  const spritesheet = readJson('public/spellicons/spellicons.json', { meta: { size: { w: 1, h: 1 } } }).meta.size;
  const SCHOOL_ICON_ALIAS = { water: 'frost', astral: 'arcane' };

  out.spells = uniqBy(
    spellAll.map((s) => {
      const id = slug(s.name);
      const key = `spell.${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}.flavor`;
      const t = spText[s.name];
      const fl = spFlavor[key] ?? t?.flavor ?? s.flavor;
      const mappedSchool = SCHOOL_ICON_ALIAS[s.school] ?? s.school;
      const frame = spIconFrames[`spell/${id}`] ?? spIconFrames[`school/${mappedSchool}`];
      return {
        id,
        type: 'spell',
        title: s.name,
        summary: t?.tooltip ?? s.desc ?? `${cap(s.school)} spell`,
        img: frame ? { src: 'spellicons/spellicons.png', atlas: { x: frame.frame.x, y: frame.frame.y, w: frame.frame.w, h: frame.frame.h, sw: spritesheet.w, sh: spritesheet.h } } : pic('spell', id, 'infobox/icon'),
        infobox: [
          ['School', cap(s.school)],
          ['Target', cap(s.target)],
          ['Mana', String(s.cost)],
          ['Cooldown', `${s.cd}`],
          ['Range', String(s.reach)],
          ...(s.min != null ? [['Damage', `${s.min}-${s.max}`]] : []),
          ...(s.status ? [['Status', `${s.status} (${s.dur})`]] : []),
          ...(s.class ? [['Class', cap(s.class)], ['Level', String(s.level_req)]] : []),
        ],
        sections: [
          ...(s.desc && s.desc !== t?.tooltip ? [{ h: 'Effect', p: [s.desc] }] : []),
          ...(t?.tooltip ? [{ h: 'Tooltip', p: [t.tooltip] }] : []),
          ...(fl ? [{ h: 'Flavor', p: [fl] }] : [{ h: 'Flavor', p: ['No lore yet.'] }]),
          ...(t?.cast_line ? [{ h: 'Cast line', p: [t.cast_line] }] : []),
        ],
        related: [`glossary/school-${s.school}`],
        tags: { school: s.school, level: s.level_req ?? 1, cls: s.class ?? '', rarity: '' },
      };
    }),
    'id',
  );

  const skills = [...C('skill-trees')];
  out.skills = skills.map((k) => ({
    id: k.id,
    type: 'skill',
    title: k.name,
    summary: `${cap(k.class)} · ${k.tree} tree · tier ${k.tier}`,
    img: pic('skill', k.id, 'infobox/icon', `icons/skills/${k.icon_hint}.png`),
    infobox: [['Class', cap(k.class)], ['Tree', k.tree], ['Tier', String(k.tier)], ['Max rank', String(k.max_rank)], ['Effect', `${statName(k.effect.stat)} ${k.effect.value}, +${k.effect.per_rank} per rank`], ['Requires', (k.requires ?? []).join(', ') || 'None']],
    sections: [{ h: 'Description', p: [k.desc || 'No lore yet.'] }],
    related: [...(k.requires ?? []).map((r) => `skill/${r}`), `class/${k.class}`],
    tags: { school: k.tree, level: k.tier, cls: k.class, rarity: '' },
  }));

  // ---------- classes & mercenaries ----------
  const heroes = readJson('public/data/content/heroes.json', {});
  const heroes8 = C('heroes-8');
  const classCards = {
    warrior: ['townart/portrait-warrior-m.png', 'townart/hero-dain.png', 'townart/frame-hero-warrior.jpg'],
    archer: ['townart/friend-archer.jpg', 'townart/portrait-warrior-f.png', 'townart/hero-selena.png'],
    mage: ['townart/portrait-mage-f.png', 'townart/portrait-mage-m.png', 'townart/hero-valerius.png', 'townart/hero-morrigan.png'],
    necromancer: [],
  };
  const classEntries = C('class-progression').map((c) => {
    const h = heroes[c.class];
    const variants = heroes8.filter((x) => x.class === c.class);
    const firstVar = variants[0];
    const sections = [];
    if (h?.description || firstVar?.description) sections.push({ h: 'Description', p: [h?.description ?? firstVar.description] });
    sections.push({ h: 'Playstyle', p: [c.playstyle, c.level_curve_note].filter(Boolean) });
    if (h?.backstory) sections.push({ h: 'Backstory', p: h.backstory });
    for (const v of variants) {
      sections.push({ h: `${cap(v.gender)} ${CLASS_LABEL[c.class] ?? cap(c.class)}`, p: [v.tagline, ...(v.backstory ?? [])].filter(Boolean) });
    }
    if (!h && !variants.length) sections.push({ h: 'Lore', p: ['No lore yet.'] });

    return {
      id: c.class,
      type: 'class',
      title: CLASS_LABEL[c.class] ?? cap(c.class),
      summary: h?.tagline ?? firstVar?.tagline ?? c.playstyle,
      img: pic('class', c.class, 'infobox/portrait', ...(classCards[c.class] ?? [])),
      infobox: [
        ...Object.entries(c.start_stats).map(([k, v]) => [`Start ${k.toUpperCase()}`, String(v)]),
        ...Object.entries(c.per_level).map(([k, v]) => [`Per level ${statName(k)}`, String(v)]),
        ['Start items', c.start_items.join(', ')],
      ],
      sections,
      related: [...out.skills.filter((s) => s.tags.cls === c.class).slice(0, 4).map((s) => `skill/${s.id}`), ...out.spells.filter((s) => s.tags.cls === c.class).slice(0, 4).map((s) => `spell/${s.id}`)],
      tags: { cls: c.class, level: 1, rarity: '' },
    };
  });
  const NAMED_HEROES = [
    { id: 'hero-dain', title: 'Dain Ironclad', cls: 'warrior', epithet: 'Vanguard Paladin', img: 'townart/hero-dain.png', portrait: 'townart/portrait-warrior-m.png', summary: 'A battle-hardened defender of Thornwick in tempered gothic plate.' },
    { id: 'hero-selena', title: 'Selena Swiftblade', cls: 'warrior', epithet: 'Borderlands Ranger', img: 'townart/hero-selena.png', portrait: 'townart/portrait-warrior-f.png', summary: 'A mercenary duelist and ranger wielding twin curved daggers.' },
    { id: 'hero-valerius', title: 'Valerius Pyremaster', cls: 'mage', epithet: 'Flame Archmage', img: 'townart/hero-valerius.png', portrait: 'townart/portrait-mage-m.png', summary: 'An ordained fire scholar from the Citadel of Embers.' },
    { id: 'hero-morrigan', title: 'Morrigan Frostweaver', cls: 'mage', epithet: 'Glacial Sorceress', img: 'townart/hero-morrigan.png', portrait: 'townart/portrait-mage-f.png', summary: 'Keeper of ancient tide-runes who freezes charging hordes.' },
  ];
  for (const nh of NAMED_HEROES) {
    classEntries.push({
      id: nh.id,
      type: 'class',
      title: nh.title,
      summary: `${nh.epithet} · ${cap(nh.cls)} archetype`,
      img: pic('class', nh.id, 'infobox/portrait', nh.img, nh.portrait),
      infobox: [['Archetype', nh.epithet], ['Class', cap(nh.cls)]],
      sections: [{ h: 'Overview', p: [nh.summary] }],
      related: [`class/${nh.cls}`],
      tags: { cls: nh.cls, level: 1, rarity: '' },
    });
  }
  out.classes = uniqBy(classEntries, 'id');

  const mercBack = Object.fromEntries(C('merc-backstories').map((b) => [b.merc, b]));
  out.mercs = C('mercenaries').map((m) => {
    const mb = mercBack[m.id];
    return {
      id: m.id,
      type: 'merc',
      title: m.name,
      summary: `${cap(m.class_hint)} · ${m.role} · Act ${m.act}`,
      img: pic('merc', m.id, 'infobox/portrait', `townart/portraits/${m.id}.jpg`),
      infobox: [
        ['Class', cap(m.class_hint)],
        ['Role', m.role],
        ['Act', String(m.act)],
        ['Hire cost', String(m.hire_cost)],
        ['Upkeep', String(m.upkeep)],
        ...Object.entries(m.stats).map(([k, v]) => [cap(k), String(v)]),
        ['Abilities', (m.abilities ?? []).join(', ')],
      ],
      sections: [
        ...(mb?.backstory || m.backstory ? [{ h: 'Backstory', p: [mb?.backstory, m.backstory].filter(Boolean) }] : [{ h: 'Backstory', p: ['No lore yet.'] }]),
        ...(m.hire_line ? [{ h: 'Hire line', p: [m.hire_line] }] : []),
        ...(mb?.battle_barks?.length ? [{ h: 'Battle barks', list: mb.battle_barks }] : []),
        ...(m.quirk ? [{ h: 'Quirk', p: [typeof m.quirk === 'string' ? m.quirk : JSON.stringify(m.quirk)] }] : []),
      ],
      related: [`class/${m.class_hint}`, `map/map${m.act}`],
      tags: { cls: m.class_hint, level: m.act, rarity: '', act: m.act },
      gate: { a: m.act },
    };
  });

  // ---------- world: cities, maps, regions, biomes, missions ----------
  const MAPS = [
    ['map1-border-fords', 1, 'loadscreens/load-map1-fords.jpg', 'town-thornwick'],
    ['map2-redmarsh-wastes', 2, 'loadscreens/load-map2-redmarsh.jpg', 'town-redmarsh'],
    ['map3-iron-coast', 3, 'loadscreens/load-map3-coast.jpg', 'town-oakhaven'],
    ['map4-obsidian-caldera', 4, 'loadscreens/load-map4-caldera.jpg', 'town-ironcamp'],
  ];
  const regionFlavor = C('region-flavor');
  const mapEntries = [];
  const regionEntries = [];
  const cityEntries = [];
  const factions = C('factions');
  const allNpcs = C('npcs');
  const mapLocations = [...C('map-locations-2'), ...C('map-locations-3')];

  for (const [file, act, img, townKey] of MAPS) {
    const m = readJson(`src/missions/${file}.map.json`);
    if (!m) continue;
    const mid = `map${act}`;
    const regs = m.regions ?? [];
    const rf = regionFlavor.filter((r) => r.act === act);
    mapEntries.push({
      id: mid,
      type: 'map',
      title: m.name,
      summary: m.text?.title ?? `Campaign map ${act}`,
      img: pic('map', mid, 'infobox/image', img),
      infobox: [
        ['Act', String(act)],
        ['Size', `${m.w}x${m.h} tiles`],
        ['Regions', String(regs.length)],
        ['Towns', (m.towns ?? []).map((t) => t.name).join(', ') || '-'],
        ['Shrines', String((m.shrines ?? []).length)],
        ['Waypoints', String((m.waypoints ?? []).length)],
        ['Factions', (m.players ?? []).join(', ')],
      ],
      sections: [
        ...(m.text?.body ? [{ h: 'Overview', p: [m.text.body] }] : []),
        { h: 'Regions', list: regs.map((r) => `${r.name} (${r.biome})`) },
      ],
      related: [...regs.map((r) => `region/${mid}-${slug(r.name)}`), ...(m.towns ?? []).map((t) => `city/${slug(t.name)}`)],
      tags: { act, level: act, rarity: '' },
      gate: { a: act },
    });

    regs.forEach((r) => {
      const rid = `${mid}-${slug(r.name)}`;
      const flavor = rf.find((x) => slug(x.name) === slug(r.name));
      regionEntries.push({
        id: rid,
        type: 'region',
        title: r.name,
        summary: `${cap(r.biome)} region of ${m.name}`,
        img: pic('region', rid, 'infobox/image', img),
        infobox: [['Map', m.name], ['Act', String(act)], ['Biome', cap(r.biome)], ['Ground zone', cap(r.zone ?? '-')], ['Bounds', `${r.x1},${r.y1} - ${r.x2},${r.y2}`], ['Music', r.music ?? '-']],
        sections: [...(flavor ? [{ h: 'Enter line', p: [flavor.enter_line] }, { h: 'Weather', list: flavor.weather_lines ?? [] }] : [{ h: 'Lore', p: ['No lore yet.'] }])],
        related: [`map/${mid}`, ...(r.biome ? [`biome/${r.biome}`] : [])],
        tags: { act, level: act, biome: r.biome, rarity: '' },
        gate: { a: act },
      });
    });

    for (const t of m.towns ?? []) {
      const cid = slug(t.name);
      const node = nodes.find((n) => n.kind === 'town' && n.act === act);
      const fac = factions.find((f) => f.name && (f.desc ?? '').toLowerCase().includes(t.name.toLowerCase()));
      const hubNpcs = allNpcs.filter((np) => np.town === townKey);
      const mapNpcNames = (t.npcs ?? []).map((n) => n.name);
      const sections = [];
      if (node?.briefing) sections.push({ h: 'Overview', p: [node.briefing] });
      if (fac) sections.push({ h: 'Faction', p: [`${fac.name}: ${fac.desc}`] });
      if (hubNpcs.length) {
        sections.push({
          h: 'Key residents & merchants',
          list: hubNpcs.map((np) => `${np.name} (${cap(np.role)}): ${np.greeting}`),
        });
      }
      if (!sections.length) sections.push({ h: 'Lore', p: ['No lore yet.'] });

      cityEntries.push({
        id: cid,
        type: 'city',
        title: t.name,
        summary: node?.briefing?.slice(0, 160) ?? `Hub of Act ${act}`,
        img: pic('city', cid, 'infobox/image', img),
        infobox: [
          ['Act', String(act)],
          ['Map', m.name],
          ['Services', ['Tavern', 'Shop', t.school != null ? 'Academy' : ''].filter(Boolean).join(', ')],
          ['Shop tiers', t.tiers ? `${t.tiers[0]}-${t.tiers[1]}` : '-'],
          ['Mercenaries for hire', String((t.mercs ?? []).length)],
          ['Residents', [...new Set([...mapNpcNames, ...hubNpcs.map((np) => np.name)])].join(', ') || '-'],
        ],
        sections,
        related: [`map/${mid}`, ...out.mercs.filter((mc) => mc.tags.act === act).slice(0, 4).map((mc) => `merc/${mc.id}`)],
        tags: { act, level: act, rarity: '' },
        gate: { a: act },
      });
    }
  }
  out.maps = mapEntries;
  out.regions = regionEntries;
  out.cities = cityEntries;

  const BIOMES = [
    ['forest', 'Forest', 'Crypt and highland ground zones'],
    ['marsh', 'Marsh', 'Ruinstone ground zones'],
    ['desert', 'Desert', 'Sand ground; ruinstone and highland zones'],
    ['crypt', 'Crypt', 'Crypt ground; ruinstone zones'],
    ['highlands', 'Highlands', 'Highland ground; crypt and snow zones'],
    ['volcanic', 'Volcanic', 'Ruinstone ground zones'],
    ['oasis', 'Oasis', 'Sand ground zones'],
  ];
  out.biomes = BIOMES.map(([id, name, zones]) => {
    const bCfg = mapGenMod.BIOMES[id];
    const natives = bCfg ? [...new Set([...(bCfg.mobFamilies ?? []), ...(bCfg.bossFamilies ?? [])])] : [];
    return {
      id,
      type: 'biome',
      title: `${name} (skirmish)`,
      summary: `Skirmish biome: ${zones}`,
      img: pic('biome', id, 'infobox/minimap (run npm run wiki:minimaps)', `wiki/minimaps/${id}.png`),
      infobox: [
        ['Mode', 'Skirmish & Expedition'],
        ['Terrain', zones],
        ['Trees', bCfg?.hasTrees ? 'Dense' : 'Sparse / None'],
        ['Map URL option', `?randskirmish=7&biome=${id}`],
      ],
      sections: [
        { h: 'Description', p: [`Random skirmish maps in the ${name.toLowerCase()} biome use ${zones.toLowerCase()}.`] },
        ...(natives.length ? [{ h: 'Native creatures', list: natives }] : []),
      ],
      related: natives.filter((f) => best52.some((b) => b.id === f)).map((f) => `bestiary/${f}`),
      tags: { biome: id, level: 0, rarity: '' },
    };
  });

  const missionText = C('map-locations');
  const mt = Object.fromEntries(missionText.map((x) => [x.id, x]));
  out.missions = missionNodes.map((n) => {
    const t = mt[n.id];
    const mNum = n.id.split('-')[0];
    return {
      id: n.id,
      type: 'mission',
      title: n.title,
      summary: t?.blurb ?? n.briefing?.slice(0, 160) ?? '',
      img: null,
      infobox: [['Act', String(n.act)], ['Code', mNum.toUpperCase()], ['Map', n.map], ...(t?.mood ? [['Mood', t.mood]] : [])],
      sections: [
        ...(n.briefing ? [{ h: 'Briefing', p: [n.briefing] }] : []),
        ...(t?.lore ? [{ h: 'Lore', p: [t.lore] }] : []),
        ...(t?.ambient_text ? [{ h: 'Ambience', list: t.ambient_text }] : []),
        ...(n.result ? [{ h: 'Outcome', list: [`Win: ${n.result.win}`, `Lose: ${n.result.lose}`] }] : []),
      ],
      related: [
        `map/map${n.act}`,
        ...rosters.filter((r) => n.id.startsWith(r.mission + '-')).flatMap((r) => [...r.families, r.boss].filter((f) => f && best52.some((b) => b.id === f)).map((f) => `bestiary/${f}`)),
      ],
      tags: { act: n.act, level: n.act, rarity: '' },
      gate: { m: mNum },
    };
  });

  // ---------- lore ----------
  const lore = [];
  lore.push({
    id: 'timeline',
    type: 'lore',
    title: 'Timeline of the Border',
    summary: 'Recorded events, oldest first.',
    img: null,
    infobox: [['Kind', 'Chronicle'], ['Events', String(C('timeline').length)]],
    sections: [{ h: 'Events', table: { head: ['Year', 'Event'], rows: C('timeline').map((e) => [String(e.year), e.event]) } }],
    related: [],
    tags: { act: 0, level: 0, rarity: '' },
  });
  for (const f of factions) {
    lore.push({
      id: f.id,
      type: 'lore',
      title: f.name,
      summary: f.desc,
      img: null,
      infobox: [['Kind', 'Faction'], ['Ranks', (f.ranks ?? []).join(', ') || '-']],
      sections: [{ h: 'About', p: [f.desc] }, ...(f.rep_lines ? [{ h: 'Reputation', list: Object.entries(f.rep_lines).map(([k, v]) => `${cap(k)}: ${v}`) }] : [])],
      related: [],
      tags: { act: 0, level: 0, rarity: '' },
    });
  }
  for (const b of C('lore-books')) {
    lore.push({
      id: b.id,
      type: 'lore',
      title: b.title,
      summary: `Book by ${b.author}, Act ${b.act}`,
      img: null,
      infobox: [['Kind', 'Lore book'], ['Author', b.author], ['Act', String(b.act)], ['Found in', b.found_in]],
      sections: [{ h: 'Text', p: [b.text] }],
      related: nodeByPrefix(String(b.found_in).split('-')[0]) ? [`mission/${nodeByPrefix(String(b.found_in).split('-')[0]).id}`] : [],
      tags: { act: b.act, level: b.act, rarity: '' },
      gate: { a: b.act },
    });
  }
  for (const c of [...C('codex-entries'), ...C('codex-entries-2')]) {
    lore.push({
      id: c.id,
      type: 'lore',
      title: c.title,
      summary: `Codex: ${c.category}, Act ${c.act}`,
      img: null,
      infobox: [['Kind', 'Codex entry'], ['Category', cap(c.category)], ['Act', String(c.act)], ['Unlock', c.unlock_hint ?? '-']],
      sections: [{ h: 'Text', p: [c.body] }],
      related: [`map/map${c.act}`],
      tags: { act: c.act, level: c.act, rarity: '' },
      gate: { a: c.act },
    });
  }
  const rumors = readJson('public/data/text/tavern-rumors-40.json', { entries: [] }).entries;
  if (rumors.length) {
    lore.push({
      id: 'tavern-rumors',
      type: 'lore',
      title: 'Tavern rumors',
      summary: `${rumors.length} rumors heard in the hubs.`,
      img: null,
      infobox: [['Kind', 'Rumors'], ['Count', String(rumors.length)]],
      sections: [1, 2, 3, 4].map((a) => ({ h: `Act ${a}`, list: rumors.filter((r) => r.stage === a).map((r) => r.text) })).filter((s) => s.list.length),
      related: [],
      tags: { act: 0, level: 0, rarity: '' },
    });
  }
  for (const ae of C('act-endings')) {
    lore.push({
      id: `act-${ae.act}-ending`,
      type: 'lore',
      title: `Act ${ae.act} Chronicle: ${ae.title}`,
      summary: ae.cliffhanger || ae.title,
      img: null,
      infobox: [['Kind', 'Act Ending'], ['Act', String(ae.act)]],
      sections: [
        { h: 'Story', p: [ae.text] },
        ...(ae.cliffhanger ? [{ h: 'Cliffhanger', p: [ae.cliffhanger] }] : []),
        ...(ae.unlocks_hint ? [{ h: 'What follows', p: [ae.unlocks_hint] }] : []),
      ],
      related: [`map/map${ae.act}`],
      tags: { act: ae.act, level: ae.act, rarity: '' },
      gate: { a: ae.act },
    });
  }
  for (const ep of C('act-epilogues')) {
    lore.push({
      id: `act-${ep.act}-epilogue`,
      type: 'lore',
      title: `Act ${ep.act} Epilogue: ${ep.title}`,
      summary: ep.text.slice(0, 140),
      img: null,
      infobox: [['Kind', 'Act Epilogue'], ['Act', String(ep.act)]],
      sections: [{ h: 'Epilogue', p: [ep.text] }],
      related: [`map/map${ep.act}`],
      tags: { act: ep.act, level: ep.act, rarity: '' },
      gate: { a: ep.act },
    });
  }
  const endingsPack = readJson('public/data/content/endings.json', { class_endings: [], ng_plus: null });
  for (const end of endingsPack.class_endings ?? []) {
    lore.push({
      id: end.id,
      type: 'lore',
      title: `Ending: ${cap(end.class)} (${slug(end.id).replace('ending-' + end.class + '-', '')})`,
      summary: `${cap(end.class)} campaign ending`,
      img: null,
      infobox: [['Kind', 'Campaign Ending'], ['Class', cap(end.class)], ['Act', '4']],
      sections: [
        { h: 'Finale', p: end.paragraphs ?? [] },
        { h: 'Epilogues', list: [end.epilogue_male, end.epilogue_female].filter(Boolean) },
      ],
      related: [`class/${end.class}`, 'map/map4'],
      tags: { act: 4, level: 4, cls: end.class },
      gate: { a: 4 },
    });
  }
  if (endingsPack.ng_plus?.modifiers?.length) {
    lore.push({
      id: 'ng-plus-cycle',
      type: 'lore',
      title: 'New Game+ (Second Cycle)',
      summary: 'Modifiers and chronicle lines unlocked after completing Act IV.',
      img: null,
      infobox: [['Kind', 'Endgame Cycle'], ['Modifiers', String(endingsPack.ng_plus.modifiers.length)], ['Act', '4']],
      sections: [
        { h: 'Cycle lines', list: endingsPack.ng_plus.cycle_lines ?? [] },
        { h: 'Modifiers', list: endingsPack.ng_plus.modifiers.map((m) => `${m.name}: ${m.desc}`) },
      ],
      related: ['map/map4'],
      tags: { act: 4, level: 4 },
      gate: { a: 4 },
    });
  }
  for (const sq of [...C('side-quests'), ...C('side-quests-2'), ...C('side-quests-3'), ...C('side-quests-4')]) {
    lore.push({
      id: sq.id,
      type: 'lore',
      title: sq.title,
      summary: `Act ${sq.act} quest · ${sq.town ?? sq.mission ?? 'Frontier'}`,
      img: null,
      infobox: [
        ['Kind', 'Side quest'],
        ['Act', String(sq.act)],
        ['Giver', sq.giver ?? '-'],
        ...(sq.reward ? [['Reward', `${sq.reward.gold ?? 0} gold, ${sq.reward.xp ?? 0} XP`]] : []),
      ],
      sections: [
        { h: 'Briefing', p: [sq.briefing || sq.summary || 'No lore yet.'] },
        ...(sq.objectives ? [{ h: 'Objectives', list: sq.objectives }] : []),
        ...(sq.twist ? [{ h: 'Choices & outcome', p: [sq.twist] }] : []),
      ],
      related: [`map/map${sq.act}`],
      tags: { act: sq.act, level: sq.act, rarity: '' },
      gate: { a: sq.act },
    });
  }
  for (const loc of mapLocations) {
    lore.push({
      id: loc.id,
      type: 'lore',
      title: loc.name,
      summary: loc.blurb,
      img: null,
      infobox: [['Kind', 'Landmark'], ['Act', String(loc.act)], ['Direction', cap(loc.region_hint ?? '-')]],
      sections: [
        { h: 'Description', p: [loc.blurb] },
        ...(loc.discovered_line ? [{ h: 'Discovery note', p: [loc.discovered_line] }] : []),
      ],
      related: [`map/map${loc.act}`],
      tags: { act: loc.act, level: loc.act, rarity: '' },
      gate: { a: loc.act },
    });
  }
  for (const fn of C('field-npcs')) {
    const portId = fn.id.replace(/^field-/, 'npc-');
    lore.push({
      id: fn.id,
      type: 'lore',
      title: fn.name,
      summary: `Act ${fn.act} ${fn.role}`,
      img: pic('lore', fn.id, 'infobox/portrait', `townart/portraits/${portId}.jpg`),
      infobox: [['Kind', 'Field NPC'], ['Role', cap(fn.role)], ['Act', String(fn.act)]],
      sections: [
        { h: 'Appearance', p: [fn.look, fn.prop ? `Carries: ${fn.prop}` : ''].filter(Boolean) },
        { h: 'Dialogue', list: [fn.line_first, fn.line_return].filter(Boolean) },
      ],
      related: [`map/map${fn.act}`],
      tags: { act: fn.act, level: fn.act, rarity: '' },
      gate: { a: fn.act },
    });
  }
  out.lore = uniqBy(lore, 'id');

  // ---------- achievements, tips, glossary ----------
  const achAll = [
    ...readJson('public/data/text/achievements-60.json', { entries: [] }).entries.map((a) => ({
      id: a.id,
      title: a.title,
      desc: a.desc,
      cat: a.category,
      extra: [['Metric', String(a.condition?.metric ?? '-')], ['Target', String(a.condition?.target ?? '-')]],
    })),
    ...C('achievements').map((a) => ({
      id: a.id,
      title: a.name,
      desc: a.desc,
      cat: a.tier ?? 'campaign',
      flavor: a.flavor,
      extra: [['Tier', cap(a.tier ?? 'bronze')], ['Secret', a.secret ? 'Yes' : 'No']],
    })),
    ...C('achievements-2').map((a) => ({
      id: a.id,
      title: a.name,
      desc: a.description,
      cat: a.tier ?? 'campaign',
      extra: [['Tier', cap(a.tier ?? 'bronze')], ['Hidden', a.hidden ? 'Yes' : 'No']],
    })),
    ...C('achievements-3').map((a) => ({
      id: a.id,
      title: a.name,
      desc: a.desc,
      cat: a.category ?? 'campaign',
      extra: [['Secret', a.secret ? 'Yes' : 'No']],
    })),
  ];
  out.achievements = uniqBy(
    achAll.map((a) => ({
      id: a.id,
      type: 'achievement',
      title: a.title,
      summary: a.desc,
      img: null,
      infobox: [['Category', cap(a.cat)], ...a.extra],
      sections: [{ h: 'Unlock condition', p: [a.desc] }, ...(a.flavor ? [{ h: 'Flavor', p: [a.flavor] }] : [])],
      related: [],
      tags: { cat: a.cat, level: 0, rarity: '' },
    })),
    'id',
  );

  const tipsAll = [
    ...readJson('public/data/text/loading-tips-50.json', { entries: [] }).entries.map((t, i) => ({
      id: t.key,
      title: `Field Tip ${i + 1}`,
      text: t.text,
      cat: 'loading',
    })),
    ...C('tips-2').map((t, i) => ({
      id: t.id || `tip2-${i}`,
      title: `${cap(t.context ?? 'combat')} Tip ${i + 1}`,
      text: t.text,
      cat: t.context ?? 'combat',
    })),
    ...C('help-pages').map((h) => ({
      id: h.id,
      title: h.title,
      text: h.body,
      cat: 'guide',
    })),
    ...readJson('public/data/text/death-messages-30.json', { entries: [] }).entries.map((d, i) => ({
      id: d.key || `death-${i}`,
      title: `Epitaph ${i + 1}`,
      text: d.text,
      cat: 'epitaph',
    })),
  ];
  out.tips = uniqBy(
    tipsAll.map((t) => ({
      id: t.id,
      type: 'tip',
      title: t.title,
      summary: t.text,
      img: null,
      infobox: [['Category', cap(t.cat)]],
      sections: [{ h: t.cat === 'guide' ? 'Guide' : 'Tip', p: [t.text] }],
      related: [],
      tags: { cat: t.cat, level: 0, rarity: '' },
    })),
    'id',
  );

  const schools = [...new Set(out.spells.map((s) => s.tags.school))];
  const gl = [];
  const term = (id, title, text, related = [], infobox = [['Kind', 'Term']]) =>
    gl.push({ id, type: 'glossary', title, summary: text, img: null, infobox, sections: [{ h: 'Definition', p: [text] }], related, tags: { level: 0, rarity: '' } });

  for (const sc of schools) {
    term(
      `school-${sc}`,
      `${cap(sc)} school`,
      `Spell school with ${out.spells.filter((s) => s.tags.school === sc).length} spells in the game tables.`,
      out.spells.filter((s) => s.tags.school === sc).slice(0, 6).map((s) => `spell/${s.id}`),
      [['Kind', 'Spell school'], ['Spells', String(out.spells.filter((s) => s.tags.school === sc).length)]],
    );
  }
  for (const r of ['common', 'magic', 'unique', 'set', 'base', 'socket', 'runeword']) {
    const cnt = out.items.concat(out.uniques, out.sets, out.affixes, out.gems).filter((i) => i.tags.rarity === r).length;
    term(`rarity-${r}`, `${cap(r)} items`, `${cnt} entries in the wiki carry the ${r} classification.`, [], [['Kind', 'Rarity'], ['Entries', String(cnt)]]);
  }
  for (const k of ['prefix', 'suffix']) {
    const cnt = out.affixes.filter((a) => a.infobox[0][1].toLowerCase() === k).length;
    term(`affix-${k}`, cap(k), `${cnt} ${k} affixes exist in the item tables.`, [], [['Kind', 'Affix class'], ['Count', String(cnt)]]);
  }
  for (const d of C('difficulty')) {
    term(
      `difficulty-${d.id}`,
      `Difficulty: ${d.name}`,
      d.desc,
      [],
      [['Kind', 'Difficulty tier'], ['Flavor', d.flavor]],
    );
  }
  for (const [cName, st] of Object.entries(d2Mod.CHAMPION_TYPES)) {
    term(
      `champion-${cName}`,
      `Champion: ${cap(cName)}`,
      `Champion monster variant: ${st.hpMult}x HP, ${st.dmgMult}x Damage, ${st.speedMult}x Speed, ${st.xpMult}x XP.`,
      [],
      [['Kind', 'Champion type'], ['HP multiplier', `${st.hpMult}x`], ['Damage multiplier', `${st.dmgMult}x`]],
    );
  }
  for (const ba of d2Mod.BOSS_AFFIXES) {
    term(
      `boss-mod-${slug(ba.id)}`,
      `Elite Mod: ${ba.name}`,
      ba.description,
      [],
      [['Kind', 'Elite boss modifier']],
    );
  }
  const craftCount = C('crafting-recipes').length;
  term(
    'crafting-cube',
    'Transmutation Cube & Crafting',
    `Combine gems (3 identical -> next grade), upgrade runes, brew Rejuvenation Potions, punch sockets, reroll gear, and craft items across ${craftCount} smithy & forge recipes.`,
    out.gems.filter((g) => g.tags.rarity === 'runeword').slice(0, 4).map((g) => `gem/${g.id}`),
    [['Kind', 'System'], ['Forge recipes', String(craftCount)], ['Runewords', String(runesMod.RUNEWORDS.length)]],
  );
  out.glossary = uniqBy(gl, 'id');

  // ---------- index & link validation ----------
  const cats = ['bestiary', 'items', 'uniques', 'sets', 'affixes', 'gems', 'spells', 'skills', 'classes', 'mercs', 'cities', 'maps', 'regions', 'biomes', 'missions', 'lore', 'achievements', 'tips', 'glossary'];
  const validRoutes = new Set();
  for (const c of cats) for (const e of out[c] ?? []) validRoutes.add(`${e.type}/${e.id}`);
  for (const c of cats) {
    for (const e of out[c] ?? []) {
      e.related = [...new Set(e.related)].filter((r) => validRoutes.has(r) && r !== `${e.type}/${e.id}`);
    }
  }

  const index = [];
  const counts = {};
  for (const c of cats) {
    counts[c] = (out[c] ?? []).length;
    for (const e of out[c] ?? []) {
      index.push({ r: `${e.type}/${e.id}`, t: e.type, id: e.id, n: e.title, s: (e.summary ?? '').slice(0, 140), img: e.img, tag: e.tags, g: e.gate });
    }
  }
  const actMap = {};
  for (const n of nodes) actMap[n.id.split('-')[0]] = n.act;
  out.index = { cats, entries: index, acts: actMap, counts };
  return { out, missing };
}

export function renderMissing(missing) {
  const seen = new Set();
  const rows = missing.filter((m) => (seen.has(`${m.type}/${m.id}/${m.where}`) ? false : (seen.add(`${m.type}/${m.id}/${m.where}`), true)));
  const lines = ['# Wiki missing images', '', 'Generated by `node tools/build-wiki-data.mjs`. Input for the art agent: entries shown with a placeholder.', '', '| id | type | where needed |', '|---|---|---|'];
  for (const r of rows) lines.push(`| ${r.id} | ${r.type} | ${r.where} |`);
  return lines.join('\n') + '\n';
}

const FILES = ['bestiary', 'items', 'uniques', 'sets', 'affixes', 'gems', 'spells', 'skills', 'classes', 'mercs', 'cities', 'maps', 'regions', 'biomes', 'missions', 'lore', 'achievements', 'tips', 'glossary', 'index'];
/** Serialised files as { name: text }, stable key order, for writing and for the staleness test. */
export function serialise(out) {
  return Object.fromEntries(FILES.map((f) => [`${f}.json`, JSON.stringify(out[f]) + '\n']));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { out, missing: miss } = buildWikiData();
  const dir = P('src', 'wiki', 'data');
  mkdirSync(dir, { recursive: true });
  const files = serialise(out);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  writeFileSync(P('tools', 'WIKI-MISSING-IMAGES.md'), renderMissing(miss));
  console.log(`wiki data: ${Object.keys(files).length} files, ${out.index.entries.length} entries, ${new Set(miss.map((m) => m.type + m.id)).size} placeholders`);
}
