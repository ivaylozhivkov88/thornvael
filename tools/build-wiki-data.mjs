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
      if (url.startsWith('file:') && url.endsWith('.json')) {
        const file = fileURLToPath(url);
        return { format: 'module', source: `export default ${readFileSync(file, 'utf8')};`, shortCircuit: true };
      }
      return nextLoad(url, context);
    },
  });
}

const [combatMod, suMod, runesMod, setsMod, d2Mod, affixMod, itemsMod, diffMod, mapGenMod, storyMod] = await Promise.all([
  import('../src/sim/combat.ts'),
  import('../src/sim/super-uniques.ts'),
  import('../src/sim/runes.ts'),
  import('../src/sim/sets.ts'),
  import('../src/sim/d2-database.ts'),
  import('../src/sim/affixes.ts'),
  import('../src/sim/items.ts'),
  import('../src/sim/difficulty.ts'),
  import('../src/map-generator.ts'),
  import('../src/story.ts'),
]);

const readJson = (rel, fallback = null) => {
  try {
    return JSON.parse(readFileSync(P(rel), 'utf8'));
  } catch {
    return fallback;
  }
};
const has = (rel) => existsSync(P('public', rel));
const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
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
const CLS_FROM_MASK = (m) =>
  m === 1 ? 'Warrior' : m === 2 ? 'Mage' : m === 3 ? 'All' : m === 4 ? 'Archer' : m === 8 ? 'Necromancer' : 'All';

const SUPER_UNIQUE_LORE = {
  'pyre-chanter-malgath':
    'Former choir-tender of the Greywood border beacons who burned his own parish ledger when the first raiders crossed the Alder. From blackened cairns he chants dead cinderlings upright again, shielding his coven behind wards of scorched bone.',
  'volt-stalker-krazak':
    'An alpha briar-hound scarred along both flanks by Fallen-Spire copper grounding rods during an autumn storm. Static arcs crackle through its matted bristles with every lunge, scattering frontier pickets faster than crossbows can wind.',
  'frostquill-skara':
    'Nesting high along the sleet-bitten crags above Ravenwatch, Skara dips her dorsal spines in winter river-rime before every ambush. Caravaneers find frozen pack-mules pinned neatly to birch trunks days before her pack strikes.',
  'bramblefist-oakhulk':
    'Bound together from ancient Alder boundary oaks fed with battle-spilled marrow and shattered iron shields. Where its root-knuckles strike the road, earth-wards fracture and curses cling like wet bog-moss.',
  'arc-carapace-vekor':
    'A gilded dune-scarab nested atop ruptured Redmarsh quartz conduits until its shell magnetized every brass rivet in the basin. Pursuers who close to sword-reach eat arcs of stored desert lightning off its chitin.',
  'venomscale-ssorath':
    'Patriarch of the alkali-pit vipers that drove three Redmarsh tax-garrisons out of their silt trenches. His fangs weep a pale mineral venom honed to slip past leather vambraces and drop unwary arcanists mid-incantation.',
  'ash-embalmer-khepri':
    'Third-Dynasty mortuary warden whose bitumen-soaked wrappings survived the fault-shift that sank the Salt-Vaults. Whenever hollow knights shatter beneath heavy mauls, Khepri binds their dry joints back together with probate wire.',
  'crimson-prowler-zara':
    'Outcast captain of the Sand-Clan reavers who painted her scimitars in red ochre mud and swore no quarter to northern levies. Wounded, she sheds shield discipline altogether for a relentless berserk charge.',
  'bog-hexer-zulmar':
    'Exiled fen-apothecary who turned coastal marsh-gas vents into blistered altars of blister-fire and blowdart ambush. Even his sniper retinue fights beneath an inherited blessing-ward stolen from a dead Oakhaven chaplain.',
  'thunderbough-elder':
    'Lightning struck this coastal ironwood three winters running during the Black Fleet blockade, fusing copper mast-chains deep inside its heartwood. Every stride shakes loose tectonic tremors along the ridge.',
  'cinderweb-arachna':
    'She spun oiled hemp and volcanic brimstone threads across the cratered orchard eaves behind Oakhaven. One spark from her spinnerets turns whole thickets of web into clinging poison fire.',
  'rimewing-valkor':
    'Born in the shattered quartz eddies above Hourglass Spit where coastal spray freezes before touching stone. Valkor blinks cleanly across tide-pools between icy volleys, leaving footmen swinging at sleet.',
  'fallen-warden-azrael':
    'Once knight-commander of the First Watch picket holding the Obsidian Approach before the Anchor Seals cracked. Still clad in frost-rimmed coronation plate, Vaelor guards the caldera stair against living and traitor alike.',
  'hellforger-kragg':
    'Master smith of the deep Cinderforge foundries who quenched star-iron ingots in his own molten veins rather than surrender his anvil. His double-headed hammer splits basalt ramparts and shields with equal fury.',
  'dreadlord-malakor':
    'Last Keeper of the Seventh Seal who traded his living name to hold the Dread Knight phalanx unbroken through four sieges. From behind locked tower shields he rains Slow and Weaken hexes down the marble colonnade.',
  'soulblight-archon':
    'Gorgath leads the inner caldera cinderhorn pack across cooling magma channels on hoof and horn. Every wound he takes only stokes his berserk furnace brighter until the obsidian dais itself runs red.',
};

const SPECIAL_ITEM_LORE = {
  'scroll-of-town-portal':
    'Inscribed by First Watch wayfarers with twin salt-chalk return sigils, tearing open a brief azure threshold straight back to the nearest fortified town hearth.',
  'greater-healing-potion':
    'Double-distilled bog-sweet, willow bark, and copper-kettle cordial sealed in thick green glass for frontline pikemen taking heavy siege trauma.',
  'greater-mana-potion':
    'Concentrated wardstone condensate bottled in faceted sapphire glass, restoring deep arcane reserves to battle-mages sustaining prolonged barrages.',
  'identification-scroll':
    'A field-trimmed vellum slip stamped with the Eye of Vaelen, issued in bundles to quartermasters appraising uncataloged relics.',
};

function synthesizeSpecialGemLore(id, name, tier) {
  const gradeNotes = {
    1: 'A raw, chipped fracture still dusty with quarry matrix, prized by frontier smiths for first-tier socket work.',
    2: 'Roughly ground on an iron treadle wheel to sharpen its facets without losing the stone’s inner resonance.',
    3: 'Cleanly cut to guild standard for reliable weapon and armor socketing or three-for-one Transmutation Cube refinement.',
    4: 'Master-faceted in Oakhaven lapidary workshops until light refracts through every bevel without clouding.',
    5: 'A peerless crown-cut jewel annealed in the Transmutation Cube, holding pure elemental charge in minimal weight.',
  };
  const famOrigin = id.includes('ruby')
    ? 'Recovered from caldera slag seams where cooling magma fuses corundum around iron pockets.'
    : id.includes('sapphire')
      ? 'Dredged from frost-rimed coastal basalt veins along the northern cliffs of Iron Coast.'
      : id.includes('topaz')
        ? 'Sieved from amber-stained Redmarsh gravel bars and polished with alkali salt.'
        : id.includes('emerald')
          ? 'Cut from deep Greywood serpentine rock veined with mineral copper and old fen-sap.'
          : 'Carved from calcified First-Dynasty ossuary bone steeped in silver ash and probate incense.';
  return `${famOrigin} ${gradeNotes[tier] ?? gradeNotes[3]} (${name}).`;
}

function synthesizeBaseItemLore(b) {
  const tierForge = [
    'Thornwick border-smiths forge this tier-1',
    'Alder garrison armorers temper this tier-2',
    'Oakhaven naval workshops finish this tier-3',
    'Ironcamp siege-foundries alloy this tier-4',
    'Caldera star-iron masters consecrate this tier-5',
  ][Math.max(0, Math.min(4, (b.tier ?? 1) - 1))];
  const socketNote =
    b.maxSockets > 0 ? ` Bored to hold up to ${b.maxSockets} socket${b.maxSockets > 1 ? 's' : ''}.` : '';
  const reqParts = [];
  if (b.reqStr) reqParts.push(`Body ${b.reqStr}`);
  if (b.reqDex) reqParts.push(`Agility ${b.reqDex}`);
  const reqNote = reqParts.length ? ` Demands ${reqParts.join(' and ')} to wield steadily.` : '';

  if (b.charmSize) {
    return `${tierForge} ${b.name}: a ${b.charmSize} pack-ward etched with frontier runes that blesses its bearer simply by being carried.`;
  }
  if (b.beltSlots) {
    return `${tierForge} ${b.name} (${b.def ?? 0} Def) with reinforced leather loops carrying ${b.beltSlots} quick-draw potion slots.${reqNote}`;
  }
  if (b.minDmg != null && b.maxDmg != null) {
    const styleMap = {
      dagger: 'short close-quarters blade built to slip past mail gaps',
      sword_1h: 'balanced one-handed blade weighted for shield-wall parries',
      sword_2h: 'heavy two-handed war-sword built to cleave pike shafts',
      axe_1h: 'bearded chopping axe honed to split timber shields and helmets',
      mace: 'flanged crushing head meant to dent plate rather than cut',
      polearm: 'long-shafted crescent blade built to check charging beasts',
      scepter: 'consecrated war-scepter balancing blunt impact with ward-channels',
      bow: 'laminated hunting stave strung with waxed sinew for volleys',
      staff: 'runed casting quarterstaff channeling elemental surges',
      wand: 'carved focus rod favored by probate necromancers and clerks',
    };
    const role = styleMap[b.weaponSubtype] ?? 'campaign weapon balanced for frontier patrols';
    return `${tierForge} ${b.name} (${b.minDmg}-${b.maxDmg} damage): a ${role}.${socketNote}${reqNote}`;
  }
  const weightNote =
    b.armorWeight === 'heavy'
      ? 'Heavy articulated plates trade -10% run speed for steadfast protection'
      : b.armorWeight === 'medium'
        ? 'Medium riveted mail balances solid deflection against -5% stride weight'
        : b.armorWeight === 'light'
          ? 'Supple light tailoring preserves full marching speed across muddy terrain'
          : b.slot === 1
            ? 'Sturdy rim-bound defense built to turn aside arrows and heavy blows'
            : 'Fitted headgear protecting the crown and brow in close skirmishes';
  const defPart = b.def != null ? ` (${b.def} Def${b.abs ? `, ${b.abs} Abs` : ''})` : '';
  return `${tierForge} ${b.name}${defPart}: ${weightNote}.${socketNote}${reqNote}`;
}

function affixDomain(a) {
  const txt = `${a.name} ${a.line}`.toLowerCase();
  if (/fire|caldera|cinder|fiery|volcanic|glowing|fissure/.test(txt)) return 'fire';
  if (/cold|frost|chilly|glacial|brine|sluice|water/.test(txt)) return 'cold';
  if (/lightning|storm|breezy|galvanic|conduction|static|air/.test(txt)) return 'lightning';
  if (/poison|bog|bitumen|vinegar|earthen|granite|dot/.test(txt)) return 'poison';
  if (/minion|probate|indentured|oath-bound/.test(txt)) return 'minion';
  if (
    /mana|mind|astral|void|leyline|pre-schism|glimmering|luminescent|celestial|thought|wisdom|archmage|witness|notarized|gall-ink|pauper-inked/.test(
      txt,
    )
  )
    return 'astral';
  if (/gold|tallies|lifesteal|bailiff|foreclosing|liquidation|dry socks|fatigue/.test(txt)) return 'fortune';
  if (
    /armor|def|abs|block|parapet|stout|hardened|tempered|indomitable|annealed|anchor|unbroken|protection|warding|aegis|riveted|tallow/.test(
      txt,
    )
  )
    return 'defense';
  if (/hp|health|regen|immortality|ox|bear|behemoth|keel|ditch|first-watch|cistern|alkali/.test(txt)) return 'vitality';
  if (/acc|evasion|dex|grace|nirvana|speed|stalking|waxed|sinew|sightlines|windlass|smoke-veiled/.test(txt))
    return 'agility';
  return 'physical';
}

function synthesizeAffixLore(a) {
  const slotsText = (a.slots ?? []).length ? (a.slots ?? []).map(cap).join(', ').toLowerCase() : 'all battle gear';
  const dom = affixDomain(a);
  const craftMap = {
    fire: 'Tempered over caldera slag-coals and rubbed with brimstone oil so heat clings along every seam.',
    cold: 'Quenched in winter river-rime and coastal brine to bleed warmth from incoming blows and chill exposed steel.',
    lightning: 'Wound with hair-fine copper grounding filaments copied from Thermodynamic Conclave coils.',
    poison: 'Cured in acidic fen-tannin and mineral pitch to turn away rot while coating edges in lingering venom.',
    astral: 'Etched with fine silver survey-sigils that draw stray ley-current straight out of the air.',
    defense:
      'Peened and double-riveted on Ironcamp anvils to turn aside lance tips, shrapnel, and crushing warhammers.',
    vitality: 'Stamped with First Watch endurance wards prized by vanguard pikemen holding narrow river crossings.',
    agility: 'Balanced and shaved to feather-light tolerances so scouts and archers loose without hesitation.',
    minion: 'Notarized in Lower-Parish probate ink, binding summoned skeletons and mercs tighter to the bearer’s will.',
    fortune: 'Inlaid with stamped assay marks and copper tally-rings favored by Redmarsh caravaneers and bailiffs.',
    physical: 'Ground on wet quarry whetstones until the bevel bites straight through iron rings and boiled leather.',
  };
  return `"${a.name}" (${cap(a.kind)}, tier ${a.tier}) — ${craftMap[dom]} Bound to ${slotsText}, conferring ${a.line}.`;
}

const REGION_FLAVOR_IDS = {
  'map1-thornwick-market-city-hub': ['rf-a1-02'],
  'map1-sunken-ford-willow-weirs': ['rf-a1-01'],
  'map1-fenwick-peat-lantern-passage': ['rf-a1-03', 'rf-a1-06'],
  'map1-greywood-canopy-vitrified-kilns': ['rf-a1-07'],
  'map1-craghorn-defile-alder-bridge': ['rf-a1-08', 'rf-a1-09'],
  'map1-ravenwatch-keep-weeping-ossuary': ['rf-a1-04', 'rf-a1-05'],
  'map1-undervault-links-ashbrook-gate': ['rf-a1-10'],
  'map2-redmarsh-outpost-city-hub': ['rf-a2-01'],
  'map2-ochre-ditch-corduroy-causeway': ['rf-a2-02', 'rf-a2-06'],
  'map2-twin-passes-bracken-basin': ['rf-a2-03', 'rf-a2-04'],
  'map2-quartz-plateau-wardstone-ring': ['rf-a2-05'],
  'map2-third-dynasty-salt-vaults': ['rf-a2-07', 'rf-a2-08'],
  'map2-deep-quarry-flooded-sluice': ['rf-a2-09'],
  'map2-fork-of-spears-ironheart-bastion': ['rf-a2-10'],
  'map3-oakhaven-harbor-city-hub': ['rf-a3-01'],
  'map3-cinder-wards-blighted-orchard': ['rf-a3-02', 'rf-a3-03'],
  'map3-greywash-canal-riverlock': ['rf-a3-07'],
  'map3-hourglass-spit-smuggler-caves': ['rf-a3-06'],
  'map3-sunken-citadel-drowned-choir': ['rf-a3-05'],
  'map3-starved-bastion-cliff-batteries': ['rf-a3-04', 'rf-a3-08', 'rf-a3-09'],
  'map3-burning-harborwatch-flagship': ['rf-a3-10'],
  'map4-ironcamp-forge-hold-city-hub': ['rf-a4-01'],
  'map4-basalt-highway-shattered-beacons': ['rf-a4-02', 'rf-a4-03'],
  'map4-besieged-wall-ashveil-summit': ['rf-a4-04', 'rf-a4-05'],
  'map4-magnetic-narrows-twofold-barbican': ['rf-a4-07'],
  'map4-gauntlet-of-iron-greystone-rampart': ['rf-a4-06'],
  'map4-three-roads-watch-headless-kings': ['rf-a4-08'],
  'map4-colonnade-of-crowns-obsidian-dais': ['rf-a4-09', 'rf-a4-10'],
};

const ACH_CAT_MAP = {
  combat: 'combat',
  campaign: 'campaign',
  exploration: 'exploration',
  economy: 'economy',
  codex: 'codex',
  mastery: 'mastery',
  classes: 'classes',
  mercenaries: 'mercenaries',
  gear: 'gear',
};

function achievementAssetFor(a) {
  const text = `${a.title ?? ''} ${a.desc ?? ''}`.toLowerCase();
  const isSecret = a.extra?.some(([k, v]) => (k === 'Secret' || k === 'Hidden') && v === 'Yes');
  let iconTier = 'bronze';
  const tierRow = a.extra?.find(([k]) => k === 'Tier')?.[1]?.toLowerCase();
  if (tierRow && ['bronze', 'silver', 'gold'].includes(tierRow)) {
    iconTier = tierRow;
  } else if (['bronze', 'silver', 'gold'].includes(String(a.cat).toLowerCase())) {
    iconTier = String(a.cat).toLowerCase();
  } else {
    const targetNum = Number(a.extra?.find(([k]) => k === 'Target')?.[1] ?? 0);
    if (isSecret || targetNum >= 100 || /hardcore|nightmare|all |complete act 4|malrik|ashkarath|master/i.test(text)) {
      iconTier = 'gold';
    } else if (targetNum >= 10 || /act 2|act 3|veteran|elite|super/i.test(text)) {
      iconTier = 'silver';
    }
  }

  let iconCat = ACH_CAT_MAP[String(a.cat).toLowerCase()];
  if (!iconCat) {
    if (isSecret) iconCat = 'secret';
    else if (/slay|kill|crit|damage|boss|blood|arena|combat|flawless|clear/i.test(text)) iconCat = 'combat';
    else if (/gold|coin|shop|merchant|buy|sell|wealth/i.test(text)) iconCat = 'economy';
    else if (/lore|book|codex|rumor|read|chronicle/i.test(text)) iconCat = 'codex';
    else if (/discover|explore|waypoint|shrine|landmark|region|map/i.test(text)) iconCat = 'exploration';
    else if (/craft|cube|rune|gem|socket|unique|set|forge|item/i.test(text)) iconCat = 'gear';
    else if (/merc|recruit|squad|hire|retinue/i.test(text)) iconCat = 'mercenaries';
    else if (/class|warrior|archer|mage|necromancer|level/i.test(text)) iconCat = 'classes';
    else if (/master|speed|no death|hard|solo/i.test(text)) iconCat = 'mastery';
    else iconCat = 'campaign';
  }
  if (isSecret && iconCat === 'campaign') iconCat = 'secret';
  return `wiki/icons/achievement-${iconCat}-${iconTier}.png`;
}

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
    const fams = new Set(
      [...(cfg.mobFamilies ?? []), cfg.mobFamily, ...(cfg.bossFamilies ?? []), cfg.bossFamily].filter(Boolean),
    );
    for (const f of fams) (foundBiomes[f] ??= []).push(bName);
  }

  const uniques = [...C('uniques'), ...C('uniques-2'), ...C('uniques-3')];
  const dropsOf = {};
  for (const u of uniques) if (u.drop_from) (dropsOf[u.drop_from] ??= []).push(u.id);
  const bossInfo = readJson('public/data/content/bosses.json', {});
  const bossExtra = Object.fromEntries(
    (readJson('public/data/content/boss-extra.json', { boss_extra: [] }).boss_extra ?? []).map((b) => [b.boss, b]),
  );
  const atlasCache = {};
  const atlasPic = (id) => {
    if (!has(`sprites/${id}.json`) || !has(`sprites/${id}.png`)) return null;
    const j = (atlasCache[id] ??= readJson(`public/sprites/${id}.json`));
    const frames = j?.frames ?? {};
    const sw = j?.meta?.size?.w ?? 2048;
    const sh = j?.meta?.size?.h ?? 2048;
    const toBox = (f, label) => ({
      x: f.frame.x,
      y: f.frame.y,
      w: f.frame.w,
      h: f.frame.h,
      sw,
      sh,
      ...(label ? { label } : {}),
    });
    const mainFrame = frames[`${id}/stand/02/00`] ?? frames[`${id}/stand/00/00`] ?? Object.values(frames)[0];
    if (!mainFrame) return null;
    const turnaround = [
      ['00', 'Front'],
      ['04', 'Left'],
      ['08', 'Back'],
      ['12', 'Right'],
    ]
      .map(([dir, label]) => {
        const f = frames[`${id}/stand/${dir}/00`];
        return f ? toBox(f, label) : null;
      })
      .filter(Boolean);
    return {
      src: `sprites/${id}.png`,
      atlas: toBox(mainFrame),
      ...(turnaround.length ? { turnaround } : {}),
    };
  };
  const portraitFor = (id) => {
    for (const c of [
      `townart/mon/${id}.jpg`,
      `townart/frame-${id}.jpg`,
      `townart/friend-${id}.jpg`,
      `townart/frame-hero-${id}.jpg`,
    ]) {
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
    const attackKind = s
      ? s.caster
        ? 'Spell'
        : s.ranged
          ? 'Ranged'
          : 'Melee'
      : kd
        ? kd.caster
          ? 'Spell'
          : kd.ranged
            ? 'Ranged'
            : 'Melee'
        : undefined;
    const cx = codex[b.id];
    const isBoss = mons.bosses.some((m) => m.id === b.id);
    const whereMissions = (foundIn[b.id] ?? []).map((m) => missionOf(m)).filter(Boolean);
    const whereBiomes = foundBiomes[b.id] ?? [];

    const sections = [];
    if (b.lore) sections.push({ h: 'Lore', p: [b.lore] });
    if (cx?.codex) sections.push({ h: 'Field notes', p: [cx.codex] });
    if (cx?.special) {
      const spDesc =
        typeof cx.special === 'string' ? [cx.special] : [cx.special.desc, cx.special.telegraph].filter(Boolean);
      const spTitle = typeof cx.special === 'string' ? 'Special ability' : (cx.special.name ?? 'Special ability');
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
    const sprite = atlasPic(b.id) ?? pic('bestiary', b.id, 'infobox/figure');
    const img = portrait ?? pic('bestiary', b.id, 'infobox/portrait');

    bestiary.push({
      id: b.id,
      type: 'bestiary',
      title: b.name,
      summary: s?.role ?? (PLAYER_SIDE.has(b.id) ? 'Playable or allied unit.' : `${cap(kd?.name ?? b.name)} unit.`),
      img,
      ...(sprite ? { sprite } : {}),
      infobox: [
        ['Kind', isBoss ? 'Boss' : PLAYER_SIDE.has(b.id) ? 'Hero-side unit' : 'Creature'],
        ...(baseHp != null
          ? [
              ['Base HP', String(baseHp)],
              ['Damage', `${baseMin}-${baseMax}`],
              ['Speed', String(speed)],
              ['Attack', attackKind ?? 'Melee'],
            ]
          : []),
        ...(s?.elem ? [['Element', ELEM_NAME[s.elem] ?? String(s.elem)]] : []),
        ['Weakness', b.weakness || cx?.weakness || 'Unknown'],
        [
          'Found in',
          whereMissions.length
            ? whereMissions
                .slice(0, 3)
                .map((n) => n.title)
                .join(', ') + (whereMissions.length > 3 ? ` +${whereMissions.length - 3}` : '')
            : whereBiomes.length
              ? whereBiomes.map(cap).join(', ')
              : 'Unknown',
        ],
      ],
      sections,
      related: [
        ...drops,
        ...whereMissions.slice(0, 4).map((n) => `mission/${n.id}`),
        ...whereBiomes.map((bm) => `biome/${bm}`),
      ],
      tags: {
        family: isBoss ? 'boss' : PLAYER_SIDE.has(b.id) ? 'ally' : 'creature',
        level: baseHp ? Math.round(baseHp / 10) : 0,
        act: actOfNode[missionOf(firstMission(b.id))?.id] ?? 0,
        core: true,
      },
      gate: firstMission(b.id) ? { m: firstMission(b.id) } : undefined,
    });
  }

  // Act III–IV Campaign & Chronicle Bosses from public/data/content/bosses.json
  const bossDialogueMap = Object.fromEntries(C('boss-dialogue').map((d) => [d.boss, d]));
  const CHRONICLE_BOSSES = [
    {
      id: 'elder-juggernaut',
      name: 'Elder Juggernaut',
      act: 3,
      spriteFamily: 'ironbark',
      elem: 'Earth',
      weakness: 'Arcane fire and sustained armor-breaking strikes along its glowing rune-seams.',
      lore: 'Bound during the Age of Chains with dwarf-forged links and packed with anthracite, this primeval bedrock colossus slumbered beneath a moss-bound highland cairn above Oakhaven. Awakened in tectonic agony as the Obsidian Caldera fractured the realm, its glowing rune-seams must be shattered before its tremors collapse Harborwatch’s sea-walls.',
    },
    {
      id: 'lord-captain-korvus',
      name: 'Lord-Captain Korvus',
      act: 3,
      spriteFamily: 'basalt-brute',
      elem: 'Physical / Fire',
      weakness: 'Spread squads clear of burning pitch pools and break formation around his hooked anchor pulls.',
      lore: 'Warlord of Harborwatch’s blazing eastern war pier during the exodus of the Iron Coast. Convinced that Thornvael must burn together rather than flee across the Western Sea, Korvus dragged twin sea-tempered iron anchors across scorched granite until Marshal Veyra’s rearguard cast him into the black surf.',
    },
    {
      id: 'arch-mage-malrik',
      name: 'Arch-Mage Malrik',
      act: 4,
      spriteFamily: 'night-orchard',
      elem: 'Astral / Fire',
      weakness: 'Advance swiftly up the switchbacks and interrupt his violet cipher casts before he reaches the summit portal.',
      lore: 'Architect of the Caldera Schism who burned out his own eyes reading unshielded leyline codices, trading sight to feel volcanic seams through the soles of his boots. Having diverted Morvessa’s Salt Tithe to fund the Iron Pact, Malrik fled Ironcamp with the Royal Cipher-Keys and fell on the summit stairs of Ashveil Gorge.',
    },
    {
      id: 'arch-warden-korrath',
      name: 'Arch-Warden Korrath',
      act: 4,
      spriteFamily: 'silt-colossus',
      elem: 'Water / Astral',
      weakness: 'Sunder the West and East Resonance Anchors first to strip his granite invulnerability, then cleanse Petrifying Stasis.',
      lore: 'Three centuries of unbroken vigil inside the frozen marble cathedral of the Crown Vault turned Arch-Warden Korrath’s flesh to pale granite. Convinced that mortal freedom breeds only slaughter, he guarded the twin Resonance Anchors and the necrotic tether choking the Obsidian Caldera until the rearguard sundered his living law.',
    },
    {
      id: 'ember-overlord-vorak',
      name: 'Ember Overlord Vorak',
      act: 4,
      spriteFamily: 'night-orchard',
      elem: 'Fire',
      weakness: 'Shatter the West and East Obsidian Conduit Pillars to sever his molten regeneration and evade Meteor Rain.',
      lore: 'Colossal warlord of the Furnace Heart who preached the Great Cleansing—that cities are slag, treaties are dry paper, and only volcanic fire reveals what deserves to endure. Standing before the screaming Crown of Thorns and Cinder, Vorak fed his throne on twin obsidian conduit pillars until the rearguard shattered his pylons.',
    },
  ];
  for (const cb of CHRONICLE_BOSSES) {
    const boss = bossInfo[cb.id];
    const dlg = bossDialogueMap[cb.id];
    const mNode = boss?.mission ? nodes.find((n) => n.id === boss.mission) : null;
    const portrait = portraitFor(cb.id) ?? pic('bestiary', cb.id, 'infobox/portrait', `townart/mon/${cb.id}.jpg`);
    const sprite = atlasPic(cb.spriteFamily) ?? pic('bestiary', cb.id, 'infobox/figure');
    const preFightNarrator = (boss?.pre_fight ?? []).find((l) => l.speaker === 'narrator')?.line;
    const quotes = [
      dlg?.intro,
      ...(dlg?.phase_lines ?? []),
      dlg?.death_line,
    ].filter(Boolean);
    const callouts = (boss?.special_callouts ?? []).map((c) => `${c.name}: ${c.telegraph_line} — ${c.hit_line}`);

    bestiary.push({
      id: cb.id,
      type: 'bestiary',
      title: cb.name,
      summary: boss?.title ?? `Act ${cb.act} Chronicle Boss`,
      img: portrait,
      ...(sprite ? { sprite } : {}),
      infobox: [
        ['Kind', 'Boss'],
        ['Title', boss?.title ?? cb.name],
        ['Act', String(cb.act)],
        ['Element', cb.elem],
        ['Weakness', cb.weakness],
        ['Found in', mNode ? mNode.title : `Act ${cb.act}`],
      ],
      sections: [
        { h: 'Lore', p: [cb.lore] },
        ...(preFightNarrator || boss?.hero_reaction
          ? [{ h: 'Encounter notes', p: [preFightNarrator, boss?.hero_reaction].filter(Boolean) }]
          : []),
        ...(callouts.length ? [{ h: 'Signature abilities', list: callouts }] : []),
        ...(quotes.length ? [{ h: 'Battle quotes', list: quotes }] : []),
        ...(boss?.loot_flavor ? [{ h: 'Trophy & relic flavor', p: [boss.loot_flavor] }] : []),
      ],
      related: [
        ...(mNode ? [`mission/${mNode.id}`] : []),
        `lore/chronicle-act-${cb.act}`,
        `lore/act-${cb.act}-ending`,
        `map/map${cb.act}`,
      ],
      tags: { family: 'boss', level: cb.act === 3 ? 82 : 95, act: cb.act, core: false },
      gate: boss?.mission ? { m: boss.mission.split('-')[0] } : { a: cb.act },
    });
  }

  // Super-Unique bosses from src/sim/super-uniques.ts
  for (const su of suMod.SUPER_UNIQUES) {
    const id = `su-${su.id}`;
    const portrait = portraitFor(su.family);
    const sprite = atlasPic(su.family) ?? pic('bestiary', id, 'infobox/figure');
    const img = portrait ?? pic('bestiary', id, 'infobox/portrait');
    bestiary.push({
      id,
      type: 'bestiary',
      title: su.name,
      summary: `${su.title} · Act ${su.act} Super Unique`,
      img,
      ...(sprite ? { sprite } : {}),
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
        { h: 'Lore', p: [SUPER_UNIQUE_LORE[su.id] ?? `${su.name} stalks the borderlands of Act ${su.act}.`] },
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
    const sprite =
      (art?.sprite ? atlasPic(art.sprite) : null) ?? atlasPic(e.id) ?? pic('bestiary', e.id, 'infobox/figure');
    const img = portrait ?? pic('bestiary', e.id, 'infobox/portrait', `townart/mon/${e.id}.jpg`);
    bestiary.push({
      id: e.id,
      type: 'bestiary',
      title: e.name,
      summary: e.behavior,
      img,
      ...(sprite ? { sprite } : {}),
      infobox: [
        ['Kind', 'Creature (Field)'],
        ['Family', cap(e.family)],
        ...(art?.sprite ? [['Sprite family', cap(art.sprite.replace(/-/g, ' '))]] : []),
        ['Act', String(e.act)],
        ['Weakness', cap(e.weakness)],
      ],
      sections: [
        { h: 'Behavior', p: [e.behavior] },
        { h: 'Lore', p: [e.lore || 'No lore yet.'] },
      ],
      related: [`map/map${e.act}`, ...(art?.sprite ? [`bestiary/${art.sprite}`] : [])],
      tags: { family: e.family, level: e.act * 5, act: e.act, core: false },
      gate: { a: e.act },
    });
  }
  out.bestiary = uniqBy(bestiary, 'id');

  // ---------- items, uniques, sets, affixes, gems/runes ----------
  const itemEntries = [];
  const iconFor = (type, id, name, where, ...extraSlugs) =>
    pic(type, id, where, ...extraSlugs.filter(Boolean).map((s) => `itemicons/${s}.png`), `itemicons/${slug(name)}.png`);

  const SIM_BASE_ICON = {
    dagger: 'flint-stiletto',
    kris: 'cinder-glass-kriss',
    short_sword: 'iron-sword',
    crystal_sword: 'adamantium-needle',
    broad_sword: 'steel-sword',
    phase_blade: 'harbor-guard-estoc',
    claymore: 'two-handed-claymore',
    colossus_blade: 'dreadnought-zweihander',
    hand_axe: 'woodcutter-handaxe',
    berserker_axe: 'berserker-decapitator',
    mace: 'flanged-mace',
    flail: 'heavy-morningstar',
    scepter: 'threshold-key-scepter',
    colossus_voulge: 'reaver-lochaber-axe',
    short_bow: 'ash-shortbow',
    hydra_bow: 'windpiercer-greatbow',
    short_staff: 'oak-staff',
    archon_staff: 'star-staff',
    bone_wand: 'tallied-bone-pointer',
    quilted_armor: 'patched-canvas-doublet',
    leather_armor: 'salt-cured-jerkin',
    breast_plate: 'oakhaven-plate-cuirass',
    mage_plate: 'wardstone-scholar-coat',
    archon_plate: 'obsidian-bastion-plate',
    ring_mail: 'interlocking-ring-mail',
    chain_mail: 'chain-mail',
    field_plate: 'redmarsh-lamellar-coat',
    full_plate: 'gothic-full-plate',
    sacred_armor: 'plate-armor',
    skull_cap: 'boiled-hide-coif',
    great_helm: 'caldera-forged-armet',
    tiara: 'assayers-copper-circlet',
    diadem: 'archmage-diadem',
    buckler: 'wooden-buckler',
    small_shield: 'tarred-plank-targe',
    kite_shield: 'steel-kite-shield',
    monarch: 'aegis-of-the-citadel',
    sash: 'hemp-rope-girdle',
    light_belt: 'tanned-oxhide-strap',
    belt: 'iron-studded-war-sash',
    plated_belt: 'caldera-plate-girdle',
    colossus_girdle: 'ember-core-cincture',
    small_charm: 'clay-talisman',
    large_charm: 'amber-fen-beetle-charm',
    grand_charm: 'astral-prism-medallion',
  };

  const GEM_FAMILY_ICON = {
    ruby: ['cinder-heart-talisman', 'ember-charm', 'caldera-ember-core', 'bloodstone-pendant', 'caldera-ember-core'],
    sapphire: ['brine-vial-pendant', 'frost-charm', 'astral-sphere', 'threshold-ward-mirror', 'astral-sphere'],
    topaz: [
      'amber-fen-beetle-charm',
      'copper-plumb-amulet',
      'salt-crystal-pendulum',
      'beacon-lens-signet',
      'amber-fen-beetle-charm',
    ],
    emerald: ['viper-antivenom-phial', 'life-charm', 'stone-charm', 'leyline-spark-elixir', 'life-charm'],
    skull: ['ossuary-bone-ward', 'bone-ring', 'ossuary-ash-incense', 'ossuary-seal-ring', 'ossuary-bone-ward'],
    diamond: [
      'novice-glass-focus',
      'chiseled-quartz-focus',
      'radiant-spell-mirror',
      'astral-prism-medallion',
      'astral-prism-medallion',
    ],
    amethyst: [
      'mind-charm',
      'smoked-quartz-monocle',
      'salt-crystal-pendulum',
      'eye-of-the-cosmos',
      'eye-of-the-cosmos',
    ],
  };

  const RUNE_ICON_POOL = [
    'leaden-parish-token',
    'iron-ration-tag',
    'chipped-flint-gorget',
    'crude-whetstone-block',
    'void-glass-shard',
    'meteoric-slag-chunk',
    'ward-charm',
    'stone-charm',
    'tallow-wax-signet',
    'beacon-lens-signet',
    'spire-keystone-band',
    'threshold-seal-gorget',
    'first-watch-oath-ring',
    'ossuary-seal-ring',
    'salt-crystal-pendulum',
    'clay-talisman',
  ];

  const SPECIAL_ICON_OVERRIDE = {
    'scroll-of-town-portal': 'parish-ward-scroll',
    'scroll-of-identification': 'notarized-hex-vellum',
    'identification-scroll': 'notarized-hex-vellum',
    'greater-healing-potion': 'greater-healing-draught',
    'greater-mana-potion': 'greater-mana-draught',
    'rejuvenation-potion': 'redmarsh-saline-tonic',
    'full-rejuvenation-potion': 'oakhaven-aqua-vitae',
    'small-talisman-charm': 'clay-talisman',
    'large-relic-charm': 'amber-fen-beetle-charm',
    'grand-mystic-charm': 'astral-prism-medallion',
    'sigil-of-ash': 'caldera-slag-signet',
    'sigil-of-hollow': 'ossuary-seal-ring',
    'sigil-of-tide': 'sea-wall-anchor-charm',
    'pinnacle-writ': 'first-watch-edict-scroll',
    'gem-chipped-garnet': 'cinder-heart-talisman',
    'gem-flawed-beryl': 'novice-glass-focus',
    'gem-peat-amber': 'amber-fen-beetle-charm',
    'gem-river-jade': 'river-pebble-band',
    'gem-quartz-prism': 'chiseled-quartz-focus',
    'gem-bloodstone-cabochon': 'bloodstone-pendant',
    'gem-rime-sapphire': 'frost-charm',
    'gem-cinder-ruby': 'ember-charm',
    'gem-astral-opal': 'astral-sphere',
    'gem-lodestone-heart': 'heart-of-the-colossus',
    'gem-starfall-diamond': 'astral-prism-medallion',
    'gem-obsidian-sun': 'eye-of-the-cosmos',
  };

  const gemSlugFor = (id, name) => {
    if (SPECIAL_ICON_OVERRIDE[id]) return SPECIAL_ICON_OVERRIDE[id];
    const clean = slug(name);
    for (const [fam, icons] of Object.entries(GEM_FAMILY_ICON)) {
      if (clean === fam || clean.endsWith('-' + fam)) {
        const gradeIdx = clean.startsWith('chipped-')
          ? 0
          : clean.startsWith('flawed-')
            ? 1
            : clean.startsWith('flawless-')
              ? 3
              : clean.startsWith('perfect-')
                ? 4
                : 2;
        return icons[gradeIdx];
      }
    }
    return null;
  };

  const runeIdBySlug = Object.fromEntries(runesMod.ALL_RUNES.map((r) => [slug(r.name), r.id]));
  const runeSlugFor = (id, name) => {
    if (SPECIAL_ICON_OVERRIDE[id]) return SPECIAL_ICON_OVERRIDE[id];
    const clean = slug(name);
    if (runeIdBySlug[clean] != null) return RUNE_ICON_POOL[(runeIdBySlug[clean] - 1) % RUNE_ICON_POOL.length];
    let hash = 0;
    for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return RUNE_ICON_POOL[hash % RUNE_ICON_POOL.length];
  };

  const gearList = readJson('public/data/items.json', { items: [] }).items;
  const itemFlavor = readJson('public/data/content/item-flavor.json', {});
  const itemLore = readJson('src/data/text/item-lore.json', {});
  const loreOf = (key) =>
    Object.keys(itemLore)
      .filter((k) => k === key || k.startsWith(`${key}.`))
      .map((k) => itemLore[k]);
  const spFlavor = readJson('src/data/text/spell-flavor.json', {});
  const spText = Object.fromEntries(C('spell-text').map((t) => [t.name, t]));
  const spellsBase = readJson('public/data/spells.json', { spells: [] }).spells;
  const spellAll = [...spellsBase, ...C('spells-new')];
  const spellByName = Object.fromEntries(spellAll.map((s) => [s.name, s]));

  const actSpanForTier = (tier) => {
    const t = Number(tier) || 1;
    if (t <= 1) return 'Act I';
    if (t === 2) return 'Act I–II';
    if (t === 3) return 'Act II–III';
    if (t === 4) return 'Act III–IV';
    return 'Act IV & Hard+ Endgame';
  };
  const dropClueForSupply = (kind, tier, slot) => {
    const span = actSpanForTier(tier);
    if (kind === 'learn') return `${span} Arcane Sanctums, Library Chests & Academy Drops`;
    if (kind === 'potion' || kind === 'scroll' || kind === 'identify' || kind === 'portal') {
      return `${span} Quartermasters, Belt Drops & Field Loot Sacks`;
    }
    return `${span} ${slot ? `${cap(slot)} ` : ''}Drops, Town Merchants & Mystery Gamble`;
  };
  const gearTierByName = Object.fromEntries(gearList.map((it) => [it.name.toLowerCase(), it.tier ?? 1]));

  for (const [idx, it] of gearList.entries()) {
    const id = slug(it.name);
    const grailTome =
      it.kind === 'learn'
        ? 'Tome V — Imperial Armory (Arcane Tomes)'
        : it.kind === 'potion' || it.kind === 'scroll' || it.kind === 'identify' || it.kind === 'portal'
          ? 'Frontier Supply Ledger (Non-Grail)'
          : 'Tome V — Imperial Armory';
    const inf = [
      ['Type', cap(it.kind)],
      ['Tier', String(it.tier)],
      ['Weight', String(it.w)],
      ['Grail Tome', grailTome],
      ['Drop Clue', dropClueForSupply(it.kind, it.tier, it.slot)],
    ];
    if (it.slot) inf.push(['Slot', cap(it.slot)]);
    if (it.cls) inf.push(['Class', cap(it.cls)]);
    if (it.min != null) inf.push(['Damage', `${it.min}-${it.max}`]);
    if (it.need) inf.push(['Requires', `${cap(it.need)} ${it.needv}`]);
    if (it.heal) inf.push(['Heals', String(it.heal)]);
    for (const k of ['armor', 'block', 'acc', 'hp', 'mana']) if (it[k] != null) inf.push([cap(k), String(it[k])]);

    const fl = itemFlavor[it.name];
    const sections = [];
    const related = [];
    if (it.kind === 'learn' && it.spell) {
      const sp = spellByName[it.spell];
      const st = spText[it.spell];
      const spKey = `spell.${it.spell
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')}.flavor`;
      const spFl = spFlavor[spKey] ?? st?.flavor ?? sp?.flavor;
      const descParts = [...new Set([fl?.flavor, sp?.desc, st?.tooltip].filter(Boolean))];
      sections.push({
        h: 'Description',
        p: descParts.length ? descParts : [`Inscribed academy parchment teaching ${it.spell}.`],
      });
      if (spFl || fl?.inspect) {
        sections.push({ h: 'Inscribed lore', p: [fl?.inspect, spFl].filter(Boolean) });
      }
      related.push(`spell/${slug(it.spell)}`);
    } else if (fl) {
      sections.push({ h: 'Description', p: [fl.flavor] });
      if (fl.inspect) sections.push({ h: 'Quartermaster notes', p: [fl.inspect] });
    } else {
      const l = loreOf(`item.${id}.lore`);
      sections.push({
        h: 'Description',
        p: l.length ? l : [`Tier ${it.tier} ${it.slot ?? it.kind} issued through Thornvael border quartermasters.`],
      });
    }

    itemEntries.push({
      id,
      type: 'item',
      title: it.name,
      summary: `${cap(it.kind)}${it.slot ? ` · ${it.slot}` : ''} · tier ${it.tier}`,
      img: iconFor('item', id, it.name, 'infobox/icon'),
      infobox: inf,
      sections,
      related,
      tags: { rarity: 'common', level: it.tier, slot: it.slot ?? it.kind, cls: it.cls ?? '', codexId: idx },
    });
  }
  for (const b of C('base-items')) {
    const id = `base-${b.id}`;
    const fl = itemFlavor[b.name];
    const sections = [{ h: 'Description', p: [b.flavor || fl?.flavor || `Tier ${b.tier} base ${b.slot}.`] }];
    if (fl?.inspect) sections.push({ h: 'Quartermaster notes', p: [fl.inspect] });
    itemEntries.push({
      id,
      type: 'item',
      title: b.name,
      summary: `Base item · ${b.slot} · tier ${b.tier}`,
      img: iconFor('item', id, b.name, 'infobox/icon', b.id),
      infobox: [
        ['Type', 'Base item'],
        ['Slot', cap(b.slot)],
        ['Tier', String(b.tier)],
        ['Class', cap(b.class_hint)],
        ['Grail Tome', 'Tome V — Imperial Armory'],
        ['Drop Clue', `${actSpanForTier(b.tier)} Weapon/Armor Racks, Elite Drops & Smithy Upgrade`],
      ],
      sections,
      related: [],
      tags: { rarity: 'base', level: b.tier, slot: b.slot, cls: b.class_hint ?? '' },
    });
  }
  // Sim D2 base items & endgame keys
  for (const b of d2Mod.BASE_ITEMS) {
    const id = `sim-${slug(b.id)}`;
    if (itemEntries.some((x) => x.title.toLowerCase() === b.name.toLowerCase())) continue;
    const slotLabel = b.charmSize ? `${cap(b.charmSize)} Charm` : b.beltSlots ? 'Belt' : (SLOT_NAME[b.slot] ?? 'Gear');
    const inf = [
      ['Type', 'Base item'],
      ['Slot', slotLabel],
      ['Tier', String(b.tier)],
      ['Max sockets', String(b.maxSockets)],
      ['Grail Tome', 'Tome V — Imperial Armory'],
      [
        'Drop Clue',
        `${actSpanForTier(b.tier)} Socketed Bases, Elite Chests & Mystery Gamble (Max ${b.maxSockets} Sockets)`,
      ],
    ];
    if (b.minDmg != null) inf.push(['Damage', `${b.minDmg}-${b.maxDmg}`]);
    if (b.def != null) inf.push(['Defense', String(b.def)]);
    if (b.abs != null) inf.push(['Absorption', String(b.abs)]);
    if (b.beltSlots) inf.push(['Potion slots', String(b.beltSlots)]);
    if (b.reqStr || b.reqDex)
      inf.push([
        'Requires',
        [b.reqStr ? `Body ${b.reqStr}` : '', b.reqDex ? `Agility ${b.reqDex}` : ''].filter(Boolean).join(', '),
      ]);
    const fl = itemFlavor[b.name];
    itemEntries.push({
      id,
      type: 'item',
      title: b.name,
      summary: `Base ${slotLabel} · tier ${b.tier}`,
      img: iconFor('item', id, b.name, 'infobox/icon', b.id, slug(b.id), SIM_BASE_ICON[b.id]),
      infobox: inf,
      sections: [
        { h: 'Description', p: [fl?.flavor || synthesizeBaseItemLore(b)] },
        ...(fl?.inspect ? [{ h: 'Quartermaster notes', p: [fl.inspect] }] : []),
      ],
      related: [],
      tags: { rarity: 'base', level: b.tier, slot: slotLabel.toLowerCase(), cls: '' },
    });
  }
  for (const sp of itemsMod.SPECIAL_ITEMS) {
    const id = slug(sp.name);
    if (itemEntries.some((x) => x.id === id)) continue;
    const extra =
      SPECIAL_ICON_OVERRIDE[id] ??
      gemSlugFor(id, sp.name) ??
      (id.startsWith('rune-') ? runeSlugFor(id, sp.name) : null);
    const specialLore =
      SPECIAL_ITEM_LORE[id] ||
      sp.lore ||
      (gemSlugFor(id, sp.name)
        ? synthesizeSpecialGemLore(id, sp.name, sp.tier)
        : `Specialized tier-${sp.tier} frontier supply item (${sp.name}).`);
    const isVaultKey = id === 'pinnacle-writ' || id.startsWith('sigil-of-');
    const isSocketable = Boolean(gemSlugFor(id, sp.name) || id.startsWith('rune-'));
    const specialTome = isVaultKey
      ? 'Tome IV — Boss Trophies & Vault Keys'
      : isSocketable
        ? 'Tome III — Runes & Socketables'
        : 'Frontier Supply Ledger (Special)';
    const specialClue = isVaultKey
      ? 'Act IV Obsidian Caldera, Hard+ Elites & Transmutation Cube (Pinnacle Vault)'
      : isSocketable
        ? `${actSpanForTier(sp.tier)} Treasure Chests, Tavern Bounties & Cube Transmutation`
        : `${actSpanForTier(sp.tier)} Quartermasters, Alchemists & Field Loot Sacks`;
    itemEntries.push({
      id,
      type: 'item',
      title: sp.name,
      summary: `Special item · tier ${sp.tier}`,
      img: iconFor('item', id, sp.name, 'infobox/icon', extra),
      infobox: [
        ['Type', 'Special'],
        ['Tier', String(sp.tier)],
        ['Weight', String(sp.w)],
        ['Grail Tome', specialTome],
        ['Drop Clue', specialClue],
      ],
      sections: [{ h: 'Description', p: [specialLore] }],
      related: [],
      tags: { rarity: sp.rarity ?? 'common', level: sp.tier, slot: 'special', cls: '' },
    });
  }
  out.items = uniqBy(itemEntries, 'id');

  const bestiaryById = Object.fromEntries(out.bestiary.map((b) => [b.id, b]));
  const missionById = Object.fromEntries(missionNodes.map((n) => [n.id, n]));
  const uniqueEntries = [];
  for (const u of uniques) {
    const id = u.id;
    const lore = loreOf(`item.unique.${id}.lore`);
    const stats = u.mods
      ? u.mods.map((m) => `${m.value > 0 ? '+' : ''}${m.value} ${statName(m.stat)}`)
      : fmtStats(u.stats);
    const sections = [
      ...(u.quirk ? [{ h: 'Quirk', p: [u.quirk] }] : []),
      ...[u.lore, u.flavor, u.inspect].filter(Boolean).map((t, i) => ({ h: i === 0 ? 'Lore' : 'Inspect', p: [t] })),
      ...(lore.length ? [{ h: 'Chronicle lore', p: lore }] : []),
    ];
    if (!sections.length) sections.push({ h: 'Lore', p: ['No lore yet.'] });
    const actNum = u.act ?? u.tier ?? 1;
    const dropMission = u.drop_from ? firstMission(u.drop_from) : '';
    const dropMissionTitle = dropMission ? (missionById[dropMission]?.title ?? dropMission.toUpperCase()) : '';
    const dropSourceName = u.drop_from ? (bestiaryById[u.drop_from]?.title ?? cap(u.drop_from.replace(/-/g, ' '))) : '';
    const uniqueDropClue = dropSourceName
      ? `${dropSourceName} (Act ${actNum}${dropMissionTitle ? ` · ${dropMissionTitle}` : ''}), Tavern Bounties & Mystery Gamble`
      : `Act ${actNum} Bosses, Super-Uniques, Tavern Bounties & Mystery Gamble (Smart Grail Pity at 25%)`;
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
        ['Grail Tome', 'Tome I — Unique Artifacts'],
        ['Drop Clue', uniqueDropClue],
        ...(u.drop_from ? [['Dropped by', dropSourceName]] : []),
        ...stats.map((s) => ['Stat', s]),
      ],
      sections,
      related: u.drop_from && statsOf[u.drop_from] ? [`bestiary/${u.drop_from}`] : [],
      tags: {
        rarity: 'unique',
        level: u.act ?? u.tier ?? 0,
        slot: '',
        cls: u.cls ?? u.class ?? '',
        act: u.act ?? u.tier ?? 0,
      },
      gate: u.drop_from && firstMission(u.drop_from) ? { m: firstMission(u.drop_from) } : { a: u.act ?? u.tier ?? 1 },
    });
  }
  out.uniques = uniqBy(uniqueEntries, 'id');

  const jsonSetFiles = [
    ...C('item-sets').map((s) => ({ s, baseTier: 2 })),
    ...C('item-sets-2').map((s) => ({ s, baseTier: 3 })),
  ];
  const jsonSets = jsonSetFiles.map(({ s, baseTier }) => {
    const pieceTiers = s.pieces.map((p) => gearTierByName[p.base?.toLowerCase()] ?? baseTier).filter(Boolean);
    const maxTier = pieceTiers.length ? Math.max(...pieceTiers) : baseTier;
    return {
      id: s.id,
      type: 'set',
      title: s.name,
      summary: `${cap(s.class)} set · ${s.pieces.length} pieces`,
      img: pic(
        'set',
        s.id,
        'infobox/icon',
        ...s.pieces.map((p) => `itemicons/${slug(p.name)}.png`),
        ...s.pieces.map((p) => `itemicons/${slug(p.base)}.png`),
      ),
      infobox: [
        ['Class', cap(s.class)],
        ['Pieces', String(s.pieces.length)],
        ['Grail Tome', 'Tome II — Sacred Sets'],
        [
          'Drop Clue',
          `${actSpanForTier(maxTier)} Champions, Boss Chests, Tavern Bounties & Mystery Gamble (${s.pieces.length}-Piece ${cap(s.class)} Set)`,
        ],
      ],
      sections: [
        { h: 'Pieces', list: s.pieces.map((p) => `${p.name} (${p.base})`) },
        { h: 'Set bonuses', list: Object.entries(s.bonuses ?? {}).map(([n, t]) => `${n} pieces: ${t}`) },
        { h: 'Lore', p: [s.lore || 'No lore yet.'] },
      ],
      related: [],
      tags: { rarity: 'set', level: s.pieces.length, cls: s.class },
    };
  });
  const SIM_SET_ICON = {
    iron_warden: 'gothic-full-plate',
    pyromancer: 'leyline-conduit-vestment',
    shadow_stalker: 'stalker-hood',
    alder_vanguard: 'sea-wall-sallet',
    redmarsh_reaver: 'reaver-lochaber-axe',
    boreal_frostweaver: 'crystal-siphon-wand',
    crown_forged: 'obsidian-greatmaul',
    astral_sovereign: 'archmage-diadem',
  };
  const SET_SLOT_FALLBACK = {
    Weapon: 'steel-sword',
    Shield: 'tower-shield',
    Helm: 'steel-helm',
    Armor: 'plate-armor',
    Boots: 'iron-boots',
    Ring: 'ring-of-valor',
    Amulet: 'ember-charm',
    Gloves: 'iron-gauntlets',
  };
  const simSets = setsMod.ALL_SETS.map((s) => {
    const id = `sim-${slug(s.id)}`;
    const cls = s.pieces[0] ? CLS_FROM_MASK(s.pieces[0].cls) : 'All';
    const maxTier = Math.max(1, ...s.pieces.map((p) => p.tier ?? 1));
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
      img: pic(
        'set',
        id,
        'infobox/icon',
        ...s.pieces.map((p) => `itemicons/${slug(p.name)}.png`),
        SIM_SET_ICON[s.id] ? `itemicons/${SIM_SET_ICON[s.id]}.png` : null,
        ...s.pieces.map((p) => `itemicons/${SET_SLOT_FALLBACK[SLOT_NAME[p.slot]] ?? 'iron-sword'}.png`),
      ),
      infobox: [
        ['Class', cls],
        ['Pieces', String(s.pieces.length)],
        ['Grail Tome', 'Tome II — Sacred Sets'],
        [
          'Drop Clue',
          `${actSpanForTier(maxTier)} Elite Packs, Super-Uniques & Mystery Gamble (${s.pieces.length}-Piece ${cls} Set)`,
        ],
      ],
      sections: [
        {
          h: 'Pieces',
          list: s.pieces.map(
            (p) => `${p.name} (${SLOT_NAME[p.slot] ?? 'Gear'}, T${p.tier})${p.lore ? ` — ${p.lore}` : ''}`,
          ),
        },
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
    ...C('affixes').map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      slots: a.slots,
      tier: String(a.tier),
      tierNum: a.tier,
      line: `${statName(a.stat)} ${a.min}${a.max !== a.min ? '-' + a.max : ''}`,
      flavor: a.flavor,
    })),
    ...C('affixes-2').map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.type,
      slots: a.slots,
      tier: String(a.tier),
      tierNum: a.tier,
      line: fmtStats(a.stats).join(', '),
      flavor: a.flavor,
    })),
    ...simAffixes,
  ];
  out.affixes = uniqBy(
    affixes.map((a) => {
      const kind = String(a.kind).toLowerCase() === 'suffix' ? 'suffix' : 'prefix';
      const domain = affixDomain(a);
      const slotsText = (a.slots ?? []).length ? (a.slots ?? []).map(cap).join(', ').toLowerCase() : 'all battle gear';
      const rawFlavor = a.flavor ? String(a.flavor).trim() : '';
      const desc =
        rawFlavor.length >= 45
          ? rawFlavor
          : rawFlavor
            ? `${rawFlavor} Forged onto ${slotsText} (tier ${a.tier}) to confer ${a.line}.`
            : synthesizeAffixLore(a);
      return {
        id: a.id,
        type: 'affix',
        title: a.name,
        summary: `${cap(a.kind)} · tier ${a.tier} · ${a.line}`,
        img: pic('affix', a.id, 'infobox/icon', `wiki/icons/affix-${kind}-${domain}.png`),
        infobox: [
          ['Kind', cap(a.kind)],
          ['Tier', a.tier],
          ['Effect', a.line],
          ['Slots', (a.slots ?? []).map(cap).join(', ') || 'All gear'],
        ],
        sections: [{ h: 'Description', p: [desc] }],
        related: [],
        tags: { rarity: 'magic', level: a.tierNum, slot: (a.slots ?? [])[0]?.toLowerCase() ?? '', cls: '' },
      };
    }),
    'id',
  );

  const fmtBonusObj = (b) => {
    if (!b) return '-';
    return (
      Object.entries(b)
        .filter(([, v]) => v != null && v !== false)
        .map(([k, v]) => (Array.isArray(v) ? `${k}: ${v.join('/')}` : v === true ? k : `${k}: +${v}`))
        .join(', ') || '-'
    );
  };
  const jsonGems = C('gems-runes').map((g) => {
    const fallbackSlug = g.kind === 'rune' ? runeSlugFor(g.id, g.name) : gemSlugFor(g.id, g.name);
    const gemTome = g.kind === 'rune' ? 'Tome III — Runes & Crafted Runewords' : 'Tome III — Socketables & Gems';
    return {
      id: g.id,
      type: 'gem',
      title: g.name,
      summary: `${cap(g.kind)} · tier ${g.tier}`,
      img: pic(
        'gem',
        g.id,
        'infobox/icon',
        `itemicons/${slug(g.name)}.png`,
        fallbackSlug ? `itemicons/${fallbackSlug}.png` : null,
      ),
      infobox: [
        ['Kind', cap(g.kind)],
        ['Tier', String(g.tier)],
        ['Grail Tome', gemTome],
        ['Drop Clue', `${actSpanForTier(g.tier)} Mineral Nodes, Treasure Chests, Tavern Bounties & Cube Upgrades`],
        ['In weapon', g.socket_effect?.weapon ?? '-'],
        ['In armor', g.socket_effect?.armor ?? '-'],
        ['Buy', String(g.buy)],
        ['Sell', String(g.sell)],
      ],
      sections: [
        { h: 'Description', p: [g.desc || 'No lore yet.'] },
        ...(g.flavor ? [{ h: 'Lore', p: [g.flavor] }] : []),
      ],
      related: [],
      tags: { rarity: 'socket', level: g.tier, slot: 'socket', cls: '' },
    };
  });
  const d2Gems = d2Mod.D2_GEMS.map((g) => {
    const id = `gem-${slug(g.name)}`;
    const fallbackSlug = gemSlugFor(id, g.name);
    return {
      id,
      type: 'gem',
      title: g.name,
      summary: `${cap(g.quality)} ${cap(g.type)} · tier ${g.tier}`,
      img: pic(
        'gem',
        id,
        'infobox/icon',
        `itemicons/${slug(g.name)}.png`,
        fallbackSlug ? `itemicons/${fallbackSlug}.png` : null,
      ),
      infobox: [
        ['Kind', 'Gem'],
        ['Quality', cap(g.quality)],
        ['Tier', String(g.tier)],
        ['Grail Tome', 'Tome III — Socketables & Gems'],
        ['Drop Clue', `${actSpanForTier(g.tier)} Gem Shrines, Elite Drops & 3-for-1 Transmutation Cube Upgrades`],
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
  const runeDropClue = (rank) => {
    if (rank <= 11) return 'Act I–II Monsters, Bounty Chests & 3-for-1 Cube Upgrades (Low Rune)';
    if (rank <= 22) return 'Act II–IV Super-Uniques, Tavern Bounties & Cube Rune Transmutation (Mid Rune)';
    return 'Act IV Obsidian Caldera Bosses, Hard/Nightmare Elites & Pinnacle Vault (High Rune)';
  };
  const simRunes = runesMod.ALL_RUNES.map((r) => {
    const id = `rune-${slug(r.name)}`;
    const fallbackSlug = runeSlugFor(id, r.name);
    return {
      id,
      type: 'gem',
      title: r.name,
      summary: `Rune #${r.id} · Req Lv ${r.clvl}`,
      img: pic(
        'gem',
        id,
        'infobox/icon',
        `itemicons/${slug(r.name)}.png`,
        fallbackSlug ? `itemicons/${fallbackSlug}.png` : null,
      ),
      infobox: [
        ['Kind', 'Rune'],
        ['Rank', String(r.id)],
        ['Required Level', String(r.clvl)],
        ['Grail Tome', 'Tome III — Runes & Crafted Runewords'],
        ['Drop Clue', runeDropClue(r.id)],
        ['In weapon', fmtBonusObj(r.weaponBonus)],
        ['In armor', fmtBonusObj(r.armorBonus)],
        ['In shield', fmtBonusObj(r.shieldBonus)],
      ],
      sections: [{ h: 'Description', p: ['Socketable rune used individually or chained in runeword recipes.'] }],
      related: runesMod.RUNEWORDS.filter((rw) => rw.runeIds.includes(r.id))
        .slice(0, 5)
        .map((rw) => `gem/rw-${rw.id}`),
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
      img: pic('gem', id, 'infobox/icon', `wiki/icons/${id}.png`),
      infobox: [
        ['Kind', 'Runeword'],
        ['Runes', recipeNames.join(' → ')],
        ['Allowed slots', slotNames],
        ['Required Level', String(rw.clvl)],
        ['Grail Tome', 'Tome III — Runes & Crafted Runewords'],
        ['Drop Clue', `Crafted by socketing ${recipeNames.join(' → ')} into ${slotNames} (Unlocks on forge)`],
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
  const spIconFrames = readJson('public/spellicons/spellicons.json', { frames: {} }).frames ?? {};
  const spritesheet = readJson('public/spellicons/spellicons.json', { meta: { size: { w: 1, h: 1 } } }).meta.size;
  const SCHOOL_ICON_ALIAS = {
    water: 'frost',
    astral: 'arcane',
    air: 'arcane',
    marksman: 'holy',
    wild: 'earth',
    bone: 'shadow',
    debt: 'shadow',
    grave: 'shadow',
  };
  const SPELL_FRAME_OVERRIDE = {
    'chain-lightning': 'spell/lightning',
    thunderstorm: 'spell/lightning',
    'static-arc': 'spell/lightning',
    haste: 'status/haste',
    gale: 'school/frost',
    'wind-ward': 'status/shield',
    'pinning-bodkin': 'status/stunned',
    'briar-snare': 'status/stunned',
    'marsh-adder-venom': 'status/poisoned',
    'spore-pod-shot': 'status/poisoned',
    'gale-step': 'status/haste',
    'ribcage-bulwark': 'status/shield',
    'ossuary-cage': 'status/stunned',
    'cold-ledger': 'status/frozen',
    'grave-quiet': 'status/frozen',
    'forgive-the-oath': 'school/holy',
  };
  const spellAtlasPic = (frameKey) => {
    const f = spIconFrames[frameKey];
    if (!f) return null;
    return {
      src: 'spellicons/spellicons.png',
      atlas: { x: f.frame.x, y: f.frame.y, w: f.frame.w, h: f.frame.h, sw: spritesheet.w, sh: spritesheet.h },
    };
  };

  out.spells = uniqBy(
    spellAll.map((s) => {
      const id = slug(s.name);
      const key = `spell.${s.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')}.flavor`;
      const t = spText[s.name];
      const fl = spFlavor[key] ?? t?.flavor ?? s.flavor;
      const mappedSchool = SCHOOL_ICON_ALIAS[s.school] ?? s.school;
      const individualIcon = has(`spellicons/${id}.png`) ? { src: `spellicons/${id}.png` } : null;
      const frameImg =
        individualIcon ??
        spellAtlasPic(SPELL_FRAME_OVERRIDE[id]) ??
        spellAtlasPic(`spell/${id}`) ??
        spellAtlasPic(`school/${mappedSchool}`);
      return {
        id,
        type: 'spell',
        title: s.name,
        summary: t?.tooltip ?? s.desc ?? `${cap(s.school)} spell`,
        img:
          frameImg ?? pic('spell', id, 'infobox/icon', `itemicons/scroll-of-${id}.png`, `itemicons/tome-of-${id}.png`),
        infobox: [
          ['School', cap(s.school)],
          ['Target', cap(s.target)],
          ['Mana', String(s.cost)],
          ['Cooldown', `${s.cd}`],
          ['Range', String(s.reach)],
          ...(s.min != null ? [['Damage', `${s.min}-${s.max}`]] : []),
          ...(s.status ? [['Status', `${s.status} (${s.dur})`]] : []),
          ...(s.class
            ? [
                ['Class', cap(s.class)],
                ['Level', String(s.level_req)],
              ]
            : []),
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

  const SKILL_TREE_ICONS = {
    Bulwark: [
      'wooden-buckler',
      'tarred-plank-targe',
      'iron-shield',
      'iron-rimmed-heater',
      'steel-kite-shield',
      'tower-shield',
      'obsidian-bulwark',
      'aegis-of-the-citadel',
    ],
    Reaver: [
      'rusty-sword',
      'peat-cleaver-hatchet',
      'iron-sword',
      'bearded-battleaxe',
      'steel-sword',
      'flamberge',
      'reaver-lochaber-axe',
      'berserker-decapitator',
    ],
    Banner: [
      'iron-helm',
      'steel-basinet',
      'ring-of-valor',
      'first-watch-oath-ring',
      'first-watch-edict-scroll',
      'dread-crest-helm',
      'crown-ember-coronet',
      'ring-of-the-champions',
    ],
    Deadeye: [
      'ash-shortbow',
      'alder-limb-flatbow',
      'fen-reed-longbow',
      'recurve-bow',
      'salt-backed-horn-bow',
      'composite-war-bow',
      'ash-spire-warbow',
      'windpiercer-greatbow',
    ],
    Stalker: [
      'leather-cap',
      'peat-dyed-trapper-hood',
      'stalker-hood',
      'tracker-treads',
      'fen-stalker-moccasins',
      'shadow-mask',
      'shadowstrike-grips',
      'windrunner-striders',
    ],
    Fletcher: [
      'latched-poacher-prod',
      'bridge-watch-latchet',
      'split-rawhide-mitts',
      'greased-archers-gloves',
      'salt-bed-gastraphetes',
      'heavy-arbalest',
      'cranequin-sea-arbalest',
      'slag-spring-repeater',
    ],
    Pyromancy: [
      'atlas:spell/fireball',
      'atlas:status/burning',
      'atlas:school/fire',
      'scroll-of-fire-bolt',
      'scroll-of-ignite',
      'scroll-of-flame-burst',
      'tome-of-meteor',
      'scroll-of-inferno',
    ],
    Tempest: [
      'atlas:spell/lightning',
      'atlas:status/haste',
      'atlas:spell/frost-bolt',
      'atlas:school/arcane',
      'scroll-of-gale',
      'scroll-of-static-arc',
      'tome-of-chain-lightning',
      'tome-of-thunderstorm',
    ],
    Wardcraft: [
      'atlas:status/shield',
      'atlas:school/holy',
      'atlas:spell/stone-skin',
      'ward-charm',
      'novice-glass-focus',
      'radiant-spell-mirror',
      'archmage-diadem',
      'astral-prism-medallion',
    ],
    Bonecraft: [
      'atlas:school/shadow',
      'tallied-bone-pointer',
      'ossuary-bone-ward',
      'bone-knuckle-grips',
      'bone-ring',
      'gravetide-ash-baton',
      'ossuary-scribe-miter',
      'scroll-of-corpse-burst',
    ],
    Probate: [
      'atlas:status/poisoned',
      'notarized-hex-vellum',
      'leaden-parish-token',
      'probate-bailiffs-band',
      'probate-seal-sash',
      'bailiffs-iron-truncheon',
      'scroll-of-weaken',
      'scroll-of-mana-burn',
    ],
    Abbey: [
      'atlas:status/frozen',
      'fen-abbey-crosier',
      'parish-ward-scroll',
      'ossuary-ash-incense',
      'scriptorium-funeral-pall',
      'ossuary-seal-ring',
      'scroll-of-grave-chill',
      'tome-of-resurrect',
    ],
  };
  const skillImgFor = (k) => {
    const idxMatch = k.id.match(/-(\d+)$/);
    const slotIdx = idxMatch ? Math.max(0, Number(idxMatch[1]) - 1) : Math.max(0, (k.tier ?? 1) - 1);
    const pool = SKILL_TREE_ICONS[k.tree];
    const choice = pool?.[slotIdx % pool.length];
    if (choice?.startsWith('atlas:')) {
      const a = spellAtlasPic(choice.slice(6));
      if (a) return a;
    }
    return pic(
      'skill',
      k.id,
      'infobox/icon',
      `icons/skills/${k.icon_hint}.png`,
      choice && !choice.startsWith('atlas:') ? `itemicons/${choice}.png` : null,
    );
  };

  const skills = [...C('skill-trees')];
  out.skills = skills.map((k) => ({
    id: k.id,
    type: 'skill',
    title: k.name,
    summary: `${cap(k.class)} · ${k.tree} tree · tier ${k.tier}`,
    img: skillImgFor(k),
    infobox: [
      ['Class', cap(k.class)],
      ['Tree', k.tree],
      ['Tier', String(k.tier)],
      ['Max rank', String(k.max_rank)],
      ['Effect', `${statName(k.effect.stat)} ${k.effect.value}, +${k.effect.per_rank} per rank`],
      ['Requires', (k.requires ?? []).join(', ') || 'None'],
    ],
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
    mage: [
      'townart/portrait-mage-f.png',
      'townart/portrait-mage-m.png',
      'townart/hero-valerius.png',
      'townart/hero-morrigan.png',
    ],
    necromancer: [
      'townart/portrait-necromancer.png',
      'townart/portraits/merc-tomb-notary.jpg',
      'townart/portraits/merc-parish-sexton.jpg',
    ],
  };
  const CLASS_SPRITE = {
    warrior: 'warrior',
    archer: 'archer',
    mage: 'mage',
    necromancer: 'ash-weaver',
  };
  const classEntries = C('class-progression').map((c) => {
    const h = heroes[c.class];
    const variants = heroes8.filter((x) => x.class === c.class);
    const firstVar = variants[0];
    const sections = [];
    if (h?.description || firstVar?.description)
      sections.push({ h: 'Description', p: [h?.description ?? firstVar.description] });
    sections.push({ h: 'Playstyle', p: [c.playstyle, c.level_curve_note].filter(Boolean) });
    if (h?.backstory) sections.push({ h: 'Backstory', p: h.backstory });
    for (const v of variants) {
      sections.push({
        h: `${cap(v.gender)} ${CLASS_LABEL[c.class] ?? cap(c.class)}`,
        p: [v.tagline, ...(v.backstory ?? [])].filter(Boolean),
      });
    }
    if (!h && !variants.length) sections.push({ h: 'Lore', p: ['No lore yet.'] });

    const spriteId = CLASS_SPRITE[c.class] ?? c.class;
    const sprite = atlasPic(spriteId) ?? pic('class', c.class, 'infobox/figure');
    return {
      id: c.class,
      type: 'class',
      title: CLASS_LABEL[c.class] ?? cap(c.class),
      summary: h?.tagline ?? firstVar?.tagline ?? c.playstyle,
      img: pic('class', c.class, 'infobox/portrait', ...(classCards[c.class] ?? [])),
      ...(sprite ? { sprite } : {}),
      infobox: [
        ...Object.entries(c.start_stats).map(([k, v]) => [`Start ${k.toUpperCase()}`, String(v)]),
        ...Object.entries(c.per_level).map(([k, v]) => [`Per level ${statName(k)}`, String(v)]),
        ['Start items', c.start_items.join(', ')],
      ],
      sections,
      related: [
        ...out.skills
          .filter((s) => s.tags.cls === c.class)
          .slice(0, 4)
          .map((s) => `skill/${s.id}`),
        ...out.spells
          .filter((s) => s.tags.cls === c.class)
          .slice(0, 4)
          .map((s) => `spell/${s.id}`),
      ],
      tags: { cls: c.class, level: 1, rarity: '' },
    };
  });
  const NAMED_HEROES = [
    {
      id: 'hero-dain',
      title: 'Dain Ironclad',
      cls: 'warrior',
      spriteId: 'hero',
      epithet: 'Vanguard Paladin',
      img: 'townart/hero-dain.png',
      portrait: 'townart/portrait-warrior-m.png',
      summary: 'A battle-hardened defender of Thornwick in tempered gothic plate.',
    },
    {
      id: 'hero-selena',
      title: 'Selena Swiftblade',
      cls: 'warrior',
      spriteId: 'archer',
      epithet: 'Borderlands Ranger',
      img: 'townart/hero-selena.png',
      portrait: 'townart/portrait-warrior-f.png',
      summary: 'A mercenary duelist and ranger wielding twin curved daggers.',
    },
    {
      id: 'hero-valerius',
      title: 'Valerius Pyremaster',
      cls: 'mage',
      spriteId: 'mage',
      epithet: 'Flame Archmage',
      img: 'townart/hero-valerius.png',
      portrait: 'townart/portrait-mage-m.png',
      summary: 'An ordained fire scholar from the Citadel of Embers.',
    },
    {
      id: 'hero-morrigan',
      title: 'Morrigan Frostweaver',
      cls: 'mage',
      spriteId: 'mage',
      epithet: 'Glacial Sorceress',
      img: 'townart/hero-morrigan.png',
      portrait: 'townart/portrait-mage-f.png',
      summary: 'Keeper of ancient tide-runes who freezes charging hordes.',
    },
  ];
  for (const nh of NAMED_HEROES) {
    const sprite = atlasPic(nh.spriteId) ?? pic('class', nh.id, 'infobox/figure');
    classEntries.push({
      id: nh.id,
      type: 'class',
      title: nh.title,
      summary: `${nh.epithet} · ${cap(nh.cls)} archetype`,
      img: pic('class', nh.id, 'infobox/portrait', nh.img, nh.portrait),
      ...(sprite ? { sprite } : {}),
      infobox: [
        ['Archetype', nh.epithet],
        ['Class', cap(nh.cls)],
      ],
      sections: [{ h: 'Overview', p: [nh.summary] }],
      related: [`class/${nh.cls}`],
      tags: { cls: nh.cls, level: 1, rarity: '' },
    });
  }
  out.classes = uniqBy(classEntries, 'id');

  const mercBack = Object.fromEntries(C('merc-backstories').map((b) => [b.merc, b]));
  out.mercs = C('mercenaries').map((m) => {
    const mb = mercBack[m.id];
    const spriteId = CLASS_SPRITE[m.class_hint] ?? m.class_hint;
    const sprite = atlasPic(spriteId) ?? pic('merc', m.id, 'infobox/figure');
    return {
      id: m.id,
      type: 'merc',
      title: m.name,
      summary: `${cap(m.class_hint)} · ${m.role} · Act ${m.act}`,
      img: pic('merc', m.id, 'infobox/portrait', `townart/portraits/${m.id}.jpg`),
      ...(sprite ? { sprite } : {}),
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
        ...(mb?.backstory || m.backstory
          ? [{ h: 'Backstory', p: [mb?.backstory, m.backstory].filter(Boolean) }]
          : [{ h: 'Backstory', p: ['No lore yet.'] }]),
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
  const regionFlavorById = Object.fromEntries(regionFlavor.map((r) => [r.id, r]));
  const locationPlaques = readJson('public/data/text/location-plaques-40.json', { entries: [] }).entries;
  const PLAQUE_STOP = new Set(['the', 'and', 'of', 'city', 'hub', 'keep', 'gate', 'pass']);
  const plaqueTokens = (s) =>
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !PLAQUE_STOP.has(w));
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
      related: [
        ...regs.map((r) => `region/${mid}-${slug(r.name)}`),
        ...(m.towns ?? []).map((t) => `city/${slug(t.name)}`),
      ],
      tags: { act, level: act, rarity: '' },
      gate: { a: act },
    });

    regs.forEach((r) => {
      const rid = `${mid}-${slug(r.name)}`;
      const mappedFlavors = (REGION_FLAVOR_IDS[rid] ?? []).map((rfId) => regionFlavorById[rfId]).filter(Boolean);
      const rToks = plaqueTokens(r.name);
      const matchedFlavors = mappedFlavors.length
        ? mappedFlavors
        : rf.filter((x) => plaqueTokens(x.name).some((t) => rToks.includes(t)));
      const matchedPlaques = locationPlaques.filter(
        (p) =>
          p.act === act &&
          (slug(r.name).includes(slug(p.region)) || plaqueTokens(p.region).some((t) => rToks.includes(t))),
      );

      const sections = [];
      const enterLines = [...new Set(matchedFlavors.map((x) => x.enter_line).filter(Boolean))];
      const weatherLines = [...new Set(matchedFlavors.flatMap((x) => x.weather_lines ?? []))];
      const ambientLines = [...new Set(matchedFlavors.flatMap((x) => x.ambient_sounds_text ?? []))];
      if (enterLines.length) sections.push({ h: 'Enter line', p: enterLines });
      if (weatherLines.length) sections.push({ h: 'Weather & Atmosphere', list: weatherLines });
      if (ambientLines.length) sections.push({ h: 'Ambient sounds', list: ambientLines });
      if (matchedPlaques.length) {
        sections.push({
          h: 'Landmarks & Plaques',
          list: matchedPlaques.map((p) => `${p.title}: ${p.text}`),
        });
      }
      if (!sections.length) {
        sections.push({
          h: 'Survey notes',
          p: [
            `${r.name} spans the ${r.biome} frontier of ${m.name} (Act ${act}), across ${r.zone ?? 'contested'} terrain.`,
          ],
        });
      }

      regionEntries.push({
        id: rid,
        type: 'region',
        title: r.name,
        summary: enterLines[0] ?? `${cap(r.biome)} region of ${m.name}`,
        img: pic('region', rid, 'infobox/minimap', `wiki/minimaps/regions/${rid}.png`, img),
        infobox: [
          ['Map', m.name],
          ['Act', String(act)],
          ['Biome', cap(r.biome)],
          ['Ground zone', cap(r.zone ?? '-')],
          ['Bounds', `${r.x1},${r.y1} - ${r.x2},${r.y2}`],
          ['Music', r.music ?? '-'],
        ],
        sections,
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
        related: [
          `map/${mid}`,
          ...out.mercs
            .filter((mc) => mc.tags.act === act)
            .slice(0, 4)
            .map((mc) => `merc/${mc.id}`),
        ],
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
        {
          h: 'Description',
          p: [`Random skirmish maps in the ${name.toLowerCase()} biome use ${zones.toLowerCase()}.`],
        },
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
      img: pic('mission', n.id, 'infobox/minimap', `wiki/minimaps/missions/${n.id}.png`),
      infobox: [
        ['Act', String(n.act)],
        ['Code', mNum.toUpperCase()],
        ['Map', n.map],
        ...(t?.mood ? [['Mood', t.mood]] : []),
      ],
      sections: [
        ...(n.briefing ? [{ h: 'Briefing', p: [n.briefing] }] : []),
        ...(t?.lore ? [{ h: 'Lore', p: [t.lore] }] : []),
        ...(t?.ambient_text ? [{ h: 'Ambience', list: t.ambient_text }] : []),
        ...(n.result ? [{ h: 'Outcome', list: [`Win: ${n.result.win}`, `Lose: ${n.result.lose}`] }] : []),
      ],
      related: [
        `map/map${n.act}`,
        ...rosters
          .filter((r) => n.id.startsWith(r.mission + '-'))
          .flatMap((r) =>
            [...r.families, r.boss].filter((f) => f && best52.some((b) => b.id === f)).map((f) => `bestiary/${f}`),
          ),
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
    img: pic('lore', 'timeline', 'infobox/emblem', 'wiki/icons/lore-timeline.png'),
    infobox: [
      ['Kind', 'Chronicle'],
      ['Events', String(C('timeline').length)],
    ],
    sections: [
      { h: 'Events', table: { head: ['Year', 'Event'], rows: C('timeline').map((e) => [String(e.year), e.event]) } },
    ],
    related: [],
    tags: { act: 0, level: 0, rarity: '' },
  });
  for (const f of factions) {
    lore.push({
      id: f.id,
      type: 'lore',
      title: f.name,
      summary: f.desc,
      img: pic('lore', f.id, 'infobox/emblem', `wiki/icons/faction-${f.id}.png`),
      infobox: [
        ['Kind', 'Faction'],
        ['Ranks', (f.ranks ?? []).join(', ') || '-'],
      ],
      sections: [
        { h: 'About', p: [f.desc] },
        ...(f.rep_lines
          ? [{ h: 'Reputation', list: Object.entries(f.rep_lines).map(([k, v]) => `${cap(k)}: ${v}`) }]
          : []),
      ],
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
      img: pic('lore', b.id, 'infobox/emblem', `wiki/icons/lore-book-act${b.act}.png`),
      infobox: [
        ['Kind', 'Lore book'],
        ['Author', b.author],
        ['Act', String(b.act)],
        ['Found in', b.found_in],
      ],
      sections: [{ h: 'Text', p: [b.text] }],
      related: nodeByPrefix(String(b.found_in).split('-')[0])
        ? [`mission/${nodeByPrefix(String(b.found_in).split('-')[0]).id}`]
        : [],
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
      img: pic(
        'lore',
        c.id,
        'infobox/emblem',
        `wiki/icons/lore-codex-${c.category}.png`,
        'wiki/icons/lore-codex-lore.png',
      ),
      infobox: [
        ['Kind', 'Codex entry'],
        ['Category', cap(c.category)],
        ['Act', String(c.act)],
        ['Unlock', c.unlock_hint ?? '-'],
      ],
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
      img: pic('lore', 'tavern-rumors', 'infobox/emblem', 'wiki/icons/lore-rumors.png'),
      infobox: [
        ['Kind', 'Rumors'],
        ['Count', String(rumors.length)],
      ],
      sections: [1, 2, 3, 4]
        .map((a) => ({ h: `Act ${a}`, list: rumors.filter((r) => r.stage === a).map((r) => r.text) }))
        .filter((s) => s.list.length),
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
      img: pic('lore', `act-${ae.act}-ending`, 'infobox/emblem', `wiki/icons/lore-act-ending-${ae.act}.png`),
      infobox: [
        ['Kind', 'Act Ending'],
        ['Act', String(ae.act)],
      ],
      sections: [
        { h: 'Story', p: [ae.text] },
        ...(ae.cliffhanger ? [{ h: 'Cliffhanger', p: [ae.cliffhanger] }] : []),
        ...(ae.unlocks_hint ? [{ h: 'What follows', p: [ae.unlocks_hint] }] : []),
      ],
      related: [`lore/chronicle-act-${ae.act}`, `lore/act-${ae.act}-epilogue`, `map/map${ae.act}`],
      tags: { act: ae.act, level: ae.act, rarity: '' },
      gate: { a: ae.act },
    });
  }

  // Canonical Story Chronicles (Acts I-IV & Threshold Endings) from src/story.ts
  const storySlidesComplete = storyMod.STORY_SLIDES ?? [];
  for (const seq of storyMod.STORY_SEQUENCES ?? []) {
    const isActIntro = seq.kind === 'intro';
    const entryId = isActIntro ? `chronicle-${seq.id}` : `chronicle-${seq.id}`;
    const firstSlideImg = seq.slides[0]?.backdrop?.replace(/^\/+/, '') || 'art/slides/slide_act1_thornwick_rain.jpg';
    const actCompleteSlide = isActIntro
      ? storySlidesComplete.find((s) => s.act === seq.act && s.trigger === 'act_end')
      : undefined;
    const bossRefs =
      seq.act === 1
        ? ['bestiary/morvessa']
        : seq.act === 2
          ? ['bestiary/gorrathul']
          : seq.act === 3
            ? ['bestiary/vesperion', 'bestiary/elder-juggernaut', 'bestiary/lord-captain-korvus']
            : ['bestiary/ashkarath', 'bestiary/arch-mage-malrik', 'bestiary/arch-warden-korrath', 'bestiary/ember-overlord-vorak'];

    lore.push({
      id: entryId,
      type: 'lore',
      title: isActIntro ? `Canonical Chronicle — ${seq.title}` : `Threshold Chronicle — ${seq.title}`,
      summary: seq.subtitle || seq.title,
      img: pic('lore', entryId, 'infobox/emblem', firstSlideImg),
      infobox: [
        ['Kind', isActIntro ? 'Canonical Act Chronicle' : 'Canonical Ending Chronicle'],
        ['Act', String(seq.act)],
        ['Slides', String(seq.slides.length)],
        ...(seq.triggerNode ? [['Trigger', seq.triggerNode]] : []),
      ],
      sections: [
        ...seq.slides.map((sl) => ({
          h: sl.heading,
          p: [sl.caption, ...(sl.reflection ? [sl.reflection] : [])],
        })),
        ...(actCompleteSlide
          ? [{ h: `${actCompleteSlide.title} — ${actCompleteSlide.subtitle}`, p: [actCompleteSlide.caption, actCompleteSlide.reflection] }]
          : []),
      ],
      related: [
        `lore/act-${seq.act}-ending`,
        `lore/act-${seq.act}-epilogue`,
        `map/map${seq.act}`,
        ...(seq.triggerNode ? [`mission/${seq.triggerNode}`] : []),
        ...(seq.completedNodeTrigger ? [`mission/${seq.completedNodeTrigger}`] : []),
        ...bossRefs,
      ],
      tags: { act: seq.act, level: seq.act, rarity: '' },
      gate: { a: seq.act },
    });
  }
  for (const ep of C('act-epilogues')) {
    lore.push({
      id: `act-${ep.act}-epilogue`,
      type: 'lore',
      title: `Act ${ep.act} Epilogue: ${ep.title}`,
      summary: ep.text.slice(0, 140),
      img: pic('lore', `act-${ep.act}-epilogue`, 'infobox/emblem', `wiki/icons/lore-act-epilogue-${ep.act}.png`),
      infobox: [
        ['Kind', 'Act Epilogue'],
        ['Act', String(ep.act)],
      ],
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
      img: pic('lore', end.id, 'infobox/emblem', `wiki/icons/lore-ending-${end.class}.png`),
      infobox: [
        ['Kind', 'Campaign Ending'],
        ['Class', cap(end.class)],
        ['Act', '4'],
      ],
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
      img: pic('lore', 'ng-plus-cycle', 'infobox/emblem', 'wiki/icons/lore-ng-plus.png'),
      infobox: [
        ['Kind', 'Endgame Cycle'],
        ['Modifiers', String(endingsPack.ng_plus.modifiers.length)],
        ['Act', '4'],
      ],
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
      img: pic('lore', sq.id, 'infobox/emblem', `wiki/icons/lore-quest-act${sq.act}.png`),
      infobox: [
        ['Kind', 'Side quest'],
        ['Act', String(sq.act)],
        ['Giver', sq.giver ?? '-'],
        ...(sq.reward ? [['Reward', `${sq.reward.gold ?? 0} gold, ${sq.reward.xp ?? 0} XP`]] : []),
      ],
      sections: [
        { h: 'Briefing', p: [sq.briefing || sq.summary || `Frontier commission recorded in Act ${sq.act}.`] },
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
      img: pic('lore', loc.id, 'infobox/emblem', `wiki/icons/lore-landmark-act${loc.act}.png`),
      infobox: [
        ['Kind', 'Landmark'],
        ['Act', String(loc.act)],
        ['Direction', cap(loc.region_hint ?? '-')],
      ],
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
      infobox: [
        ['Kind', 'Field NPC'],
        ['Role', cap(fn.role)],
        ['Act', String(fn.act)],
      ],
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
      extra: [
        ['Metric', String(a.condition?.metric ?? '-')],
        ['Target', String(a.condition?.target ?? '-')],
      ],
    })),
    ...C('achievements').map((a) => ({
      id: a.id,
      title: a.name,
      desc: a.desc,
      cat: a.tier ?? 'campaign',
      flavor: a.flavor,
      extra: [
        ['Tier', cap(a.tier ?? 'bronze')],
        ['Secret', a.secret ? 'Yes' : 'No'],
      ],
    })),
    ...C('achievements-2').map((a) => ({
      id: a.id,
      title: a.name,
      desc: a.description,
      cat: a.tier ?? 'campaign',
      extra: [
        ['Tier', cap(a.tier ?? 'bronze')],
        ['Hidden', a.hidden ? 'Yes' : 'No'],
      ],
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
      img: pic('achievement', a.id, 'infobox/crest', achievementAssetFor(a)),
      infobox: [['Category', cap(a.cat)], ...a.extra],
      sections: [{ h: 'Unlock condition', p: [a.desc] }, ...(a.flavor ? [{ h: 'Flavor', p: [a.flavor] }] : [])],
      related: [],
      tags: { cat: a.cat, level: 0, rarity: '' },
    })),
    'id',
  );

  const newGameplayTips = [
    {
      id: 'tip-assist-auto-cast',
      title: 'Auto-Cast Spells & Per-Spell Toggle',
      cat: 'spells',
      text: 'Right-click (desktop) or long-press (mobile) any learned spell to bind Auto-Cast. When enabled in Settings, healing spells trigger at 65% squad HP while offensive casts respect your 15% mana reserve.',
      related: ['glossary/auto-cast-spells', 'glossary/auto-fight-modes'],
    },
    {
      id: 'tip-assist-auto-go',
      title: 'Auto-Go & Ambush Guard Safety',
      cat: 'map',
      text: 'Enable Auto-Go in Settings to march along the shortest A* path toward mission objectives; Ambush Guard automatically halts your squad in formation the moment any enemy enters sight, and any manual click cancels immediately.',
      related: ['glossary/auto-go-objective', 'glossary/regroup-to-hero'],
    },
    {
      id: 'tip-assist-auto-fight',
      title: 'Choosing an Auto-Fight Mode',
      cat: 'combat',
      text: 'Switch Auto-Fight between Off / Manual (strict classic orders), Self-Defense (retaliate when struck), and Tactical AI (full autonomous engagement and spell priority) anytime from the Pause Menu or Main Menu Settings.',
      related: ['glossary/auto-fight-modes', 'glossary/squad-stances'],
    },
    {
      id: 'tip-assist-loot-sweep',
      title: 'Post-Combat Loot Sweep & Belt Potions',
      cat: 'items',
      text: 'Press F (or toggle Auto-Loot Sweep in Settings) after clearing an encounter to gather nearby gold piles, loot sacks, and belt potions, while Auto-Potion Threshold drinks belt charges automatically below 30% or 45% HP.',
      related: ['glossary/auto-loot-sweep', 'glossary/auto-potion-threshold'],
    },
    {
      id: 'tip-tactical-stances',
      title: 'Hold Bridges with H / G / A & Regroup [R]',
      cat: 'combat',
      text: 'Set bridge blockers to Hold Ground [H] for zero melee chase, use Guard [G] for a 3-tile leash or Aggressive [A] for 9-tile pursuit, and press R to pull scattered mercenaries back into a two-rank formation around your hero.',
      related: ['glossary/squad-stances', 'glossary/regroup-to-hero'],
    },
    {
      id: 'tip-tactical-high-ground',
      title: 'Seize Ridge Elevation for Bonus Crit & Range',
      cat: 'combat',
      text: 'Position archers and mages at least 2 height steps above foes to gain +1.5 tile range, +15% accuracy, and +10% crit chance; firing uphill by 2 or more steps imposes a -15% accuracy penalty.',
      related: ['glossary/high-ground-advantage', 'glossary/squad-stances'],
    },
    {
      id: 'tip-merc-veterancy',
      title: 'Build Veteran Mercenary Perks',
      cat: 'hero',
      text: 'Keep hired mercenaries alive across battles so kills and survived missions promote them from Recruit to Veteran, Elite, and Champion Guard, unlocking Shield Wall, Double Draw, and Arcane Conduit perks.',
      related: ['glossary/mercenary-veterancy', 'glossary/mercenary-gear-slots'],
    },
    {
      id: 'tip-merc-sanctuary',
      title: 'Revive Fallen Veterans at the Temple',
      cat: 'town',
      text: 'When a veteran mercenary falls in battle, visit the town Temple to pay a gold tithe for Temple Resurrection, restoring your fallen companion with their full kill count, veterancy rank, and charm slot intact.',
      related: ['glossary/temple-resurrection', 'glossary/mercenary-veterancy'],
    },
    {
      id: 'tip-holy-grail-hunt',
      title: 'Track All Five Tomes in the Imperial Holy Grail',
      cat: 'items',
      text: 'Open the Hall of Relics Codex to track 132 Uniques, 28 Sacred Sets, 33 Runes & 25 Runewords, 20 Boss Trophies, and 187 Armory Bases; rolls at 98% Perfection or higher earn an everlasting Primal Foil frame.',
      related: ['glossary/holy-grail-tomes', 'glossary/grail-roll-perfection'],
    },
    {
      id: 'tip-holy-grail-pins',
      title: 'Pin Up to 3 Grail Targets for Drop Clues',
      cat: 'guide',
      text: 'Pin up to three missing relics as active Grail Targets on the Codex or Wiki to highlight matching campaign missions, Tavern Bounty targets, and drop clues across every act.',
      related: ['glossary/grail-target-pinning', 'glossary/holy-grail-boons'],
    },
    {
      id: 'tip-town-bounties',
      title: 'Check Tavern Bounties Before Redeploying',
      cat: 'town',
      text: 'Town taverns post regional Super-Unique Bounty Contracts offering guaranteed rune, rare, or unique drops — an efficient way to target-farm pinned Holy Grail items.',
      related: ['glossary/tavern-bounties', 'glossary/grail-target-pinning'],
    },
    {
      id: 'tip-town-gamble',
      title: 'Mystery Gamble & Smart Grail Pity',
      cat: 'town',
      text: 'Spend surplus gold on town Mystery Gamble slots once you unlock the 25% Holy Grail Milestone, activating Smart Grail Pity (+25% weight toward uncollected Uniques and Sacred Set pieces).',
      related: ['glossary/mystery-gamble', 'glossary/holy-grail-boons'],
    },
  ];

  const tipsAll = [
    ...readJson('public/data/text/loading-tips-50.json', { entries: [] }).entries.map((t, i) => ({
      id: t.key,
      title: `Field Tip ${i + 1}`,
      text: t.text,
      cat: 'loading',
      related: [],
    })),
    ...C('tips-2').map((t, i) => ({
      id: t.id || `tip2-${i}`,
      title: `${cap(t.context ?? 'combat')} Tip ${i + 1}`,
      text: t.text,
      cat: t.context ?? 'combat',
      related: [],
    })),
    ...C('help-pages').map((h) => ({
      id: h.id,
      title: h.title,
      text: h.body,
      cat: 'guide',
      related: [],
    })),
    ...newGameplayTips,
    ...readJson('public/data/text/death-messages-30.json', { entries: [] }).entries.map((d, i) => ({
      id: d.key || `death-${i}`,
      title: `Epitaph ${i + 1}`,
      text: d.text,
      cat: 'epitaph',
      related: [],
    })),
  ];
  out.tips = uniqBy(
    tipsAll.map((t) => ({
      id: t.id,
      type: 'tip',
      title: t.title,
      summary: t.text,
      img: pic('tip', t.id, 'infobox/emblem', `wiki/icons/tip-${t.cat}.png`, 'wiki/icons/tip-general.png'),
      infobox: [['Category', cap(t.cat)]],
      sections: [{ h: t.cat === 'guide' ? 'Guide' : 'Tip', p: [t.text] }],
      related: t.related ?? [],
      tags: { cat: t.cat, level: 0, rarity: '' },
    })),
    'id',
  );

  const schools = [...new Set(out.spells.map((s) => s.tags.school))];
  const gl = [];
  const term = (
    id,
    title,
    text,
    related = [],
    infobox = [['Kind', 'Term']],
    extraSections = [],
    iconPath = `wiki/icons/glossary-${id}.png`,
  ) =>
    gl.push({
      id,
      type: 'glossary',
      title,
      summary: text,
      img: pic('glossary', id, 'infobox/emblem', iconPath),
      infobox,
      sections: [{ h: 'Overview', p: [text] }, ...extraSections],
      related,
      tags: { level: 0, rarity: '' },
    });

  for (const sc of schools) {
    term(
      `school-${sc}`,
      `${cap(sc)} school`,
      `Spell school with ${out.spells.filter((s) => s.tags.school === sc).length} spells in the game tables.`,
      out.spells
        .filter((s) => s.tags.school === sc)
        .slice(0, 6)
        .map((s) => `spell/${s.id}`),
      [
        ['Kind', 'Spell school'],
        ['Spells', String(out.spells.filter((s) => s.tags.school === sc).length)],
      ],
    );
  }
  for (const r of ['common', 'magic', 'unique', 'set', 'base', 'socket', 'runeword']) {
    const cnt = out.items
      .concat(out.uniques, out.sets, out.affixes, out.gems)
      .filter((i) => i.tags.rarity === r).length;
    term(
      `rarity-${r}`,
      `${cap(r)} items`,
      `${cnt} entries in the wiki carry the ${r} classification.`,
      [],
      [
        ['Kind', 'Rarity'],
        ['Entries', String(cnt)],
      ],
    );
  }
  for (const k of ['prefix', 'suffix']) {
    const cnt = out.affixes.filter((a) => a.infobox[0][1].toLowerCase() === k).length;
    term(
      `affix-${k}`,
      cap(k),
      `${cnt} ${k} affixes exist in the item tables.`,
      [],
      [
        ['Kind', 'Affix class'],
        ['Count', String(cnt)],
      ],
    );
  }
  for (const d of C('difficulty')) {
    term(
      `difficulty-${d.id}`,
      `Difficulty: ${d.name}`,
      d.desc,
      [],
      [
        ['Kind', 'Difficulty tier'],
        ['Flavor', d.flavor],
      ],
    );
  }
  for (const [cName, st] of Object.entries(d2Mod.CHAMPION_TYPES)) {
    term(
      `champion-${cName}`,
      `Champion: ${cap(cName)}`,
      `Champion monster variant: ${st.hpMult}x HP, ${st.dmgMult}x Damage, ${st.speedMult}x Speed, ${st.xpMult}x XP.`,
      [],
      [
        ['Kind', 'Champion type'],
        ['HP multiplier', `${st.hpMult}x`],
        ['Damage multiplier', `${st.dmgMult}x`],
      ],
    );
  }
  for (const ba of d2Mod.BOSS_AFFIXES) {
    term(`boss-mod-${slug(ba.id)}`, `Elite Mod: ${ba.name}`, ba.description, [], [['Kind', 'Elite boss modifier']]);
  }
  const craftCount = C('crafting-recipes').length;
  term(
    'crafting-cube',
    'Transmutation Cube & Crafting',
    `Combine gems (3 identical -> next grade), upgrade runes, brew Rejuvenation Potions, punch sockets, reroll gear, and craft items across ${craftCount} smithy & forge recipes.`,
    out.gems
      .filter((g) => g.tags.rarity === 'runeword')
      .slice(0, 4)
      .map((g) => `gem/${g.id}`),
    [
      ['Kind', 'System'],
      ['Forge recipes', String(craftCount)],
      ['Runewords', String(runesMod.RUNEWORDS.length)],
    ],
  );

  // ---- Optional Gameplay Assists (Settings) ----
  term(
    'auto-cast-spells',
    'Auto-Cast Spells',
    'Optional deterministic spell automation toggled in Settings (Off, Per-Spell, or Smart) and bound per spell via desktop Right-Click or mobile Long-Press, marked with a rotating rune border on the hotkey bar.',
    ['glossary/auto-fight-modes', 'glossary/auto-potion-threshold', 'tip/tip-assist-auto-cast'],
    [
      ['Kind', 'Gameplay Assist'],
      ['Toggle', 'Right-Click / Long-Press + Settings'],
      ['Heal Threshold', '65% HP (default)'],
      ['Mana Reserve', '15% Mana (default)'],
    ],
    [
      {
        h: 'Priority Rules (Evaluated Every 8 Ticks)',
        list: [
          'Healing spells (Healing, Healing Rain) target the lowest-HP squad member at or below 65% HP within cast range.',
          'Defensive buffs (Stone Skin, Blessing, Haste, Wind Ward) refresh unbuffed allies while actively in combat.',
          'Offensive bolts (Fire Bolt, Frost Bolt, Lightning, Marrow Dart) fire in place of wand shots while conserving the 15% mana reserve for emergencies.',
        ],
      },
    ],
    'wiki/icons/tip-spells.png',
  );
  term(
    'auto-go-objective',
    'Auto-Go to Objective',
    'Optional A* path-navigation assist (Off or On in Settings) that marches the hero and squad toward the active mission waypoint while Ambush Guard halts in combat-ready formation the instant any foe enters sight.',
    ['glossary/auto-fight-modes', 'glossary/regroup-to-hero', 'tip/tip-assist-auto-go'],
    [
      ['Kind', 'Gameplay Assist'],
      ['Pathing', 'A* Shortest Route'],
      ['Safety Interrupt', 'Ambush Guard on Enemy Sight'],
      ['Cancel', 'Any manual move or order click'],
    ],
    [
      {
        h: 'Operational Behavior',
        p: [
          'Designed for effortless mobile traversal across cleared corridors without walking blindly into ambushes. Manual right-clicks or touch commands cancel Auto-Go immediately so purists always retain command.',
        ],
      },
    ],
    'wiki/icons/tip-map.png',
  );
  term(
    'auto-fight-modes',
    'Auto-Fight Modes',
    'Configurable squad autonomy selector in Main Menu and Pause Menu Settings with three modes: Off / Manual for pure classic RTS control, Self-Defense for adjacent retaliation, and Tactical AI for autonomous engagements.',
    ['glossary/auto-cast-spells', 'glossary/squad-stances', 'tip/tip-assist-auto-fight'],
    [
      ['Kind', 'Gameplay Assist'],
      ['Modes', 'Off / Manual · Self-Defense · Tactical AI'],
      ['Availability', 'Main Menu & In-Game Pause Menu'],
    ],
    [
      {
        h: 'Mode Breakdown',
        list: [
          'Off / Manual: Zero automated combat decisions; every move, target switch, and cast stays 100% manual.',
          'Self-Defense: Squad units strike back when attacked in reach without breaking formation or chasing across the map.',
          'Tactical AI: Hero and mercenaries acquire visible enemies, prioritize dangerous casters or wounded targets, and weave assigned skills.',
        ],
      },
    ],
    'wiki/icons/tip-combat.png',
  );
  term(
    'auto-loot-sweep',
    'Auto-Loot Sweep & Loot Sweep [F]',
    'Optional post-combat item pickup setting (and manual F hotkey / HUD button) that sweeps nearby gold piles, belt potions, and loot sacks once no enemies remain within an 8-tile radius.',
    ['glossary/auto-potion-threshold', 'glossary/holy-grail-tomes', 'tip/tip-assist-loot-sweep'],
    [
      ['Kind', 'Gameplay Assist & Hotkey'],
      ['Hotkey', 'F / HUD Sweep Button'],
      ['Safety Radius', 'No hostiles within 8 tiles'],
    ],
    [
      {
        h: 'Collected Items',
        p: [
          'Automatically routes belt-eligible healing and mana potions into open belt slots, adds gold directly to the war chest, and bags dropped equipment sacks into hero inventory without tedious individual taps on mobile screens.',
        ],
      },
    ],
    'wiki/icons/tip-items.png',
  );
  term(
    'auto-potion-threshold',
    'Auto-Potion Belt Threshold',
    'Optional Settings assist allowing belt healing potions to fire automatically when hero health falls below 0 (Off), 30%, or 45%, protecting commanders during hectic multi-front fights.',
    ['glossary/auto-loot-sweep', 'glossary/mercenary-gear-slots', 'tip/tip-assist-loot-sweep'],
    [
      ['Kind', 'Gameplay Assist'],
      ['Thresholds', '0 (Off) · 30% HP · 45% HP'],
      ['Source', 'Equipped Belt Potion Slots'],
    ],
    [
      {
        h: 'Purist Control',
        p: [
          'Set the threshold to 0 (Off) for strict manual hotkey potion timing, or select 30% / 45% on mobile touchscreens where quick-slotting during AoE targeting is tight.',
        ],
      },
    ],
    'wiki/icons/achievement-gear-silver.png',
  );

  // ---- Tactical Squad Control & Terrain ----
  term(
    'squad-stances',
    'Squad Stances (H / G / A)',
    'Classic three-tier tactical leash system letting players switch selected mercenaries between Hold Ground [H] (0-tile melee chase for bridge blocks), Guard / Defensive [G] (3-tile anchor leash), and Aggressive [A] (9-tile pursuit).',
    ['glossary/regroup-to-hero', 'glossary/high-ground-advantage', 'tip/tip-tactical-stances'],
    [
      ['Kind', 'Tactical Control'],
      ['Hold Ground [H]', '0-tile melee chase · full range fire'],
      ['Guard [G]', '3-tile leash around anchor/hero'],
      ['Aggressive [A]', 'Up to 9-tile pursuit'],
    ],
    [
      {
        h: 'Bridge & Choke Discipline',
        p: [
          'Hold Ground prevents melee spear-carriers and shield guards from stepping off narrow bridges or gate gaps, letting archers and mages bombard trapped packs in safety.',
        ],
      },
    ],
    'wiki/icons/achievement-combat-silver.png',
  );
  term(
    'regroup-to-hero',
    'Regroup to Hero [R]',
    'Squad emergency formation command triggered by [R] or the mobile HUD Regroup button, initiating a 1.5-second disengage that rallies allies into a disciplined two-rank guard around the hero.',
    ['glossary/squad-stances', 'glossary/auto-go-objective', 'tip/tip-tactical-stances'],
    [
      ['Kind', 'Tactical Control'],
      ['Hotkey', 'R / Mobile HUD Button'],
      ['Disengage', '1.5s pullback into 2-rank screen'],
    ],
    [
      {
        h: 'Two-Rank Formation',
        p: [
          'Heavy melee warriors and frontliners snap to the forward arc facing threats while ranged bowmen and spellcasters settle behind the hero, rescuing overextended mercenaries before boss cleaves.',
        ],
      },
    ],
    'wiki/icons/tip-hero.png',
  );
  term(
    'high-ground-advantage',
    'High Ground Tactical Advantage',
    'Terrain elevation combat modifier using map height differences: firing downhill with >= +2 height steps grants +1.5 tile range, +15% accuracy, and +10% crit chance, while firing uphill by >= 2 steps applies a -15% accuracy penalty.',
    ['glossary/squad-stances', 'glossary/auto-fight-modes', 'tip/tip-tactical-high-ground'],
    [
      ['Kind', 'Terrain Combat Rule'],
      ['High Ground (dh >= +2)', '+1.5 range · +15% acc · +10% crit'],
      ['Uphill Shot (dh <= -2)', '-15% accuracy penalty'],
      ['Indicator', 'HUD Elevation Badge'],
    ],
    [
      {
        h: 'Tactical Positioning',
        p: [
          'Claiming quarry ledges, river bluffs, and caldera terraces swings skirmishes decisively in your favor — especially when pairing archers with Hold Ground [H] blockers below.',
        ],
      },
    ],
    'wiki/icons/achievement-exploration-gold.png',
  );

  // ---- Mercenary Veterancy & Sanctuary ----
  term(
    'mercenary-veterancy',
    'Mercenary Veterancy Ranks & Perks',
    'Persistent mercenary progression tracking lifetime kills and survived missions across four ranks — Recruit, Veteran, Elite, and Champion Guard — displaying SquadBar chevron badges and unlocking passive class perks.',
    ['glossary/temple-resurrection', 'glossary/mercenary-gear-slots', 'tip/tip-merc-veterancy'],
    [
      ['Kind', 'Mercenary Progression'],
      ['Ranks', 'Recruit -> Veteran -> Elite -> Champion Guard'],
      ['Class Perks', 'Shield Wall · Double Draw · Arcane Conduit'],
    ],
    [
      {
        h: 'Passive Class Perks',
        list: [
          'Shield Wall: Frontline guards mitigate incoming physical cleaves and brace adjacent allies in tight formations.',
          'Double Draw: Veteran archers gain rapid-nock volley cadence and heightened target priority on ranged foes.',
          'Arcane Conduit: Battle mages and adepts siphon mana faster and amplify elemental bolt potency.',
        ],
      },
    ],
    'wiki/icons/achievement-mercenaries-gold.png',
  );
  term(
    'temple-resurrection',
    'Temple Resurrection',
    'Town Arcane Sanctum and Temple service that revives fallen mercenaries for a gold tithe, preserving their persistent kill tally, veterancy chevrons, perks, and personal equipment instead of replacing them with raw recruits.',
    ['glossary/mercenary-veterancy', 'glossary/mercenary-gear-slots', 'tip/tip-merc-sanctuary'],
    [
      ['Kind', 'Town Service'],
      ['Location', 'Town Arcane Sanctum / Temple'],
      ['Preserved State', 'Veterancy Rank · Kills · Perks · Loadout'],
    ],
    [
      {
        h: 'Why Resurrect Veterans',
        p: [
          'While cheap recruits can be hired afresh, a Champion Guard carrying hard-won perks and a high-tier charm slot is far stronger and retains continuity across the campaign and Endgame Vault.',
        ],
      },
    ],
    'wiki/icons/achievement-mercenaries-silver.png',
  );
  term(
    'mercenary-gear-slots',
    'Mercenary Charm & Auto-Potion Slots',
    'Personal mercenary inventory slots granting each companion one Charm or Ring slot for passive resistances and stats plus two healing potion slots that auto-trigger whenever the mercenary drops below 30% HP.',
    ['glossary/mercenary-veterancy', 'glossary/auto-potion-threshold', 'tip/tip-merc-veterancy'],
    [
      ['Kind', 'Mercenary Loadout'],
      ['Trinket Slot', '1 Charm or Ring per mercenary'],
      ['Belt Potions', '2 Healing Potions (auto-used < 30% HP)'],
    ],
    [
      {
        h: 'Sustaining Your Frontline',
        p: [
          'Stocking belt potions on tank mercenaries lets them weather Act III–IV boss bursts autonomously without consuming hero spell cooldowns every few seconds.',
        ],
      },
    ],
    'wiki/icons/achievement-mercenaries-bronze.png',
  );

  // ---- The Holy Grail & Imperial Reliquary ----
  term(
    'holy-grail-tomes',
    'The Holy Grail & Five Imperial Tomes',
    'Account-wide endgame collector compendium tracking every distinct Unique Artifact (132), Sacred Set (28), Rune & Crafted Runeword (33 + 25), Boss Trophy (20), and Imperial Armory Base (187) with full Live Wiki Sync and Save Backup export.',
    ['glossary/grail-target-pinning', 'glossary/grail-roll-perfection', 'glossary/holy-grail-boons'],
    [
      ['Kind', 'Endgame Collector System'],
      ['Storage Key', 'thornvael_grail_v2 (codex_v1 compat)'],
      ['Five Tomes', 'Uniques · Sets · Runes & RW · Bosses · Armory'],
    ],
    [
      {
        h: 'Five Grail Tomes',
        list: [
          'Tome I — Unique Artifacts: 132 named relics across all four acts.',
          'Tome II — Sacred Sets: 28 multi-piece class sets and set completion racks.',
          'Tome III — Runes & Crafted Runewords: 33 runes and 25 socketed runewords unlocked upon forging.',
          'Tome IV — Boss Trophies & Super-Uniques: 20 apex boss seals across Normal, Hard, and Nightmare.',
          'Tome V — Imperial Armory: 187 base weapons, armors, shields, charms, and arcane tomes.',
        ],
      },
    ],
    'wiki/icons/achievement-codex-gold.png',
  );
  term(
    'grail-target-pinning',
    'Target-Farming Clues & Grail Pins',
    'Discovery guidance replacing blank ??? slots with icon silhouettes, rumored Act/Boss Drop Clues, and the ability to pin up to 3 missing items as Active Grail Targets to highlight matching missions, Tavern Bounties, and Wiki panels.',
    ['glossary/holy-grail-tomes', 'glossary/tavern-bounties', 'tip/tip-holy-grail-pins'],
    [
      ['Kind', 'Grail Hunting Feature'],
      ['Max Active Pins', '3 Targets (thornvael_grail_pins_v1)'],
      ['Map Integration', 'Campaign Map · Tavern Bounties · Wiki'],
    ],
    [
      {
        h: 'Live Wiki Pinning & Ground Beams',
        p: [
          'Every item, unique, set, gem, and bestiary article displays its live Grail status and lets you Pin Grail Targets directly. On the battlefield, uncollected Grail items drop with a gold-purple star beam and choral discovery chime.',
        ],
      },
    ],
    'wiki/icons/achievement-codex-silver.png',
  );
  term(
    'grail-roll-perfection',
    'Roll Perfection & Primal Foil Frames',
    'Provenance and quality tracking attached to every Grail discovery ({ hero, class, level, mission, boss, rollPerfectionPct }), firing Grail Record Broken alerts on upgrades and awarding a Primal Gold-Purple Foil Frame for >= 98% rolls.',
    ['glossary/holy-grail-tomes', 'glossary/holy-grail-boons', 'tip/tip-holy-grail-hunt'],
    [
      ['Kind', 'Grail Provenance'],
      ['Primal Threshold', '>= 98% Roll Perfection'],
      ['Recorded Stamp', 'Hero · Class · Level · Mission · Monster'],
    ],
    [
      {
        h: 'Chasing Primal Rolls',
        p: [
          'Even after finding a Unique relic once, higher-rolled drops break your personal % Perfection record and stamp the Live Wiki banner with your victorious hero and encounter provenance.',
        ],
      },
    ],
    'wiki/icons/glossary-rarity-unique.png',
  );
  term(
    'holy-grail-boons',
    'Holy Grail Milestone Boons & Replica Forging',
    'Account-wide progression rewards unlocked at 10%, 25%, 50%, 75%, and 100% Holy Grail completion, granting escalating Magic Find, Smart Grail Pity, Reliquary Replica Forging, and exclusive Grail Guardian Bounties.',
    ['glossary/holy-grail-tomes', 'glossary/mystery-gamble', 'glossary/tavern-bounties'],
    [
      ['Kind', 'Account-Wide Progression'],
      ['10% Milestone', '+8% Magic Find & Bronze Reliquary Seal'],
      ['25% Milestone', 'Smart Grail Pity (+25% uncollected weight)'],
      ['50% Milestone', '+18% MF & Reliquary Replica Forging'],
      ['75% Milestone', '+30% MF & 4 Grail Guardian Bounties'],
      ['100% Milestone', 'Sovereign Crown · Town Aura · Hall of Fame'],
    ],
    [
      {
        h: 'Replica Forging & Endgame Incentives',
        p: [
          'At 50% Grail completion, Reliquary Replica Forging lets new heroes commission a replica of a previously discovered Unique once per Act using gold and runes, turning Grail mastery into tangible power across fresh runs.',
        ],
      },
    ],
    'wiki/icons/achievement-mastery-gold.png',
  );

  // ---- Tavern Bounties & Mystery Gamble ----
  term(
    'tavern-bounties',
    'Tavern Bounty Contracts',
    'Regional Super-Unique hunting contracts posted in town taverns across all four acts, sending squads after named apex monsters for guaranteed rune, rare, or unique rewards — flagged automatically when matching pinned Grail Targets.',
    ['glossary/grail-target-pinning', 'glossary/mystery-gamble', 'tip/tip-town-bounties'],
    [
      ['Kind', 'Replayable Town Contract'],
      ['Posted At', 'Act I–IV Town Taverns'],
      ['Rewards', 'Guaranteed Runes, Rares & Unique Chances'],
    ],
    [
      {
        h: 'Target-Farming Integration',
        p: [
          'Once you pass the 25% Grail milestone, Smart Grail Pity biases Bounty Boss loot toward missing relics, and reaching 75% unlocks four high-stakes Grail Guardian Bounty Contracts.',
        ],
      },
    ],
    'wiki/icons/tip-town.png',
  );
  term(
    'mystery-gamble',
    'Mystery Gamble & Smart Grail Pity',
    'Town merchant gold-sink tab letting commanders wager gold on mystery item slots with chances at magic, rare, Sacred Set, and Unique outcomes — boosted by Smart Grail Pity (+25% weight toward missing Grail items) once 25% Grail is reached.',
    ['glossary/holy-grail-boons', 'glossary/tavern-bounties', 'tip/tip-town-gamble'],
    [
      ['Kind', 'Town Economy Feature'],
      ['Currency', 'Gold Coin'],
      ['Smart Grail Pity', '+25% Uncollected Weight at 25% Grail'],
    ],
    [
      {
        h: 'Smart Gold Sink',
        p: [
          'Turns late-campaign gold surpluses into focused target-farming rolls for specific weapon or armor slots needed to complete Sacred Sets and the Five Tomes.',
        ],
      },
    ],
    'wiki/icons/achievement-economy-gold.png',
  );

  out.glossary = uniqBy(gl, 'id');

  // ---------- index & link validation ----------
  const cats = [
    'bestiary',
    'items',
    'uniques',
    'sets',
    'affixes',
    'gems',
    'spells',
    'skills',
    'classes',
    'mercs',
    'cities',
    'maps',
    'regions',
    'biomes',
    'missions',
    'lore',
    'achievements',
    'tips',
    'glossary',
  ];
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
      index.push({
        r: `${e.type}/${e.id}`,
        t: e.type,
        id: e.id,
        n: e.title,
        s: (e.summary ?? '').slice(0, 140),
        img: e.img,
        tag: e.tags,
        g: e.gate,
      });
    }
  }
  const actMap = {};
  for (const n of nodes) actMap[n.id.split('-')[0]] = n.act;
  out.index = { cats, entries: index, acts: actMap, counts };
  return { out, missing };
}

export function renderMissing(missing) {
  const seen = new Set();
  const rows = missing.filter((m) =>
    seen.has(`${m.type}/${m.id}/${m.where}`) ? false : (seen.add(`${m.type}/${m.id}/${m.where}`), true),
  );
  const lines = [
    '# Wiki missing images',
    '',
    'Generated by `node tools/build-wiki-data.mjs`. Input for the art agent: entries shown with a placeholder.',
    '',
    '| id | type | where needed |',
    '|---|---|---|',
  ];
  for (const r of rows) lines.push(`| ${r.id} | ${r.type} | ${r.where} |`);
  return lines.join('\n') + '\n';
}

const FILES = [
  'bestiary',
  'items',
  'uniques',
  'sets',
  'affixes',
  'gems',
  'spells',
  'skills',
  'classes',
  'mercs',
  'cities',
  'maps',
  'regions',
  'biomes',
  'missions',
  'lore',
  'achievements',
  'tips',
  'glossary',
  'index',
];
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
  console.log(
    `wiki data: ${Object.keys(files).length} files, ${out.index.entries.length} entries, ${new Set(miss.map((m) => m.type + m.id)).size} placeholders`,
  );
}
