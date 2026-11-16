import type { Pack } from './bot';
import { DEFS, Elem, Kind, M, MODN } from './combat';
import { monsterFamilyById, monsterPaletteByTier, type MonsterFamilyDef } from './data';
import type { Sim } from './sim';
import { MAGE_SPELLS } from './spelldata';

export type TacticalAiRole =
  | 'coward_swarm'
  | 'ranged_kiter'
  | 'ambush_lunger'
  | 'berserker_charger'
  | 'juggernaut_tank'
  | 'shaman_reviver'
  | 'hexer_caster';

export type SuperUniqueCrown = 'flame' | 'lightning' | 'frost' | 'thorns' | 'venom' | 'skull' | 'blood';

export interface SuperUniqueVisual {
  readonly scale: number;
  readonly tint: number;
  readonly auraColor: number;
  readonly crown: SuperUniqueCrown;
}

export interface SuperUniqueRetinue {
  readonly family: string;
  readonly count: number;
  readonly kind: number;
  readonly tier: number;
}

export interface SuperUniqueDef {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly act: 1 | 2 | 3 | 4;
  readonly family: string;
  readonly kind: number;
  readonly elem: number;
  readonly tier: 4 | 5;
  readonly mods: readonly string[];
  readonly retinue: SuperUniqueRetinue;
  readonly ai: TacticalAiRole;
  readonly visual: SuperUniqueVisual;
  readonly signatureAbilities: readonly string[];
  readonly summary: string;
}

export const SUPER_UNIQUES: readonly SuperUniqueDef[] = [
  // ================= ACT I: The Border Fords =================
  {
    id: 'pyre-chanter-malgath',
    name: 'Malgath, Chanter of the Pyre',
    title: 'Chanter of the Pyre',
    act: 1,
    family: 'fallen-shaman',
    kind: Kind.Mage,
    elem: Elem.Fire,
    tier: 4,
    mods: ['fire_enchanted', 'magic_resistant'],
    retinue: { family: 'cinderling', count: 5, kind: Kind.Imp, tier: 2 },
    ai: 'shaman_reviver',
    visual: { scale: 1.45, tint: 0xff4500, auraColor: 0xff6a00, crown: 'flame' },
    signatureAbilities: [
      'Ember Revival: Resurrects slain Cinderling corpses from the backline.',
      'Crimson Pyre Bolt: Hurls high-damage Fire Bolts and Weaken hexes at approaching heroes.',
      'Magic Ward: Impervious to elemental spells with reinforced fire and astral resistance.',
    ],
    summary: 'Ember Revival corpse resurrection, Crimson Pyre Bolt, Magic Ward',
  },
  {
    id: 'volt-stalker-krazak',
    name: 'Krazak, the Volt Stalker',
    title: 'the Volt Stalker',
    act: 1,
    family: 'briar-hound',
    kind: Kind.Gnoll,
    elem: Elem.Air,
    tier: 4,
    mods: ['lightning_enchanted', 'extra_fast'],
    retinue: { family: 'briar-hound', count: 5, kind: Kind.Gnoll, tier: 2 },
    ai: 'berserker_charger',
    visual: { scale: 1.4, tint: 0x38b6ff, auraColor: 0x00d8ff, crown: 'lightning' },
    signatureAbilities: [
      'Charged Bolt Nova: Releases crackling arcs of lightning whenever struck.',
      'Frenzied Blitz: Sprints at blinding speed to flank lightly armored casters.',
      'Briar Pack Frenzy: Commands a swift pack of Briar Hounds that scatter if he falls.',
    ],
    summary: 'Charged Bolt Nova on hit, Frenzied Blitz sprint, Briar Pack Frenzy',
  },
  {
    id: 'frostquill-skara',
    name: 'Skara, Matron of Frostquills',
    title: 'Matron of Frostquills',
    act: 1,
    family: 'quill-fiend',
    kind: Kind.Archer,
    elem: Elem.Water,
    tier: 4,
    mods: ['cold_enchanted', 'extra_strong'],
    retinue: { family: 'quill-fiend', count: 4, kind: Kind.Archer, tier: 2 },
    ai: 'ranged_kiter',
    visual: { scale: 1.38, tint: 0x60b8ff, auraColor: 0x4da6ff, crown: 'frost' },
    signatureAbilities: [
      'Glacial Quill Volley: Piercing frost-tipped spines that chill and slow targets.',
      'Evasive Kiting: Retreats immediately when melee enemies close within 3.2 tiles.',
      'Deadly Aim: Extra Strong ranged precision shredding exposed targets from afar.',
    ],
    summary: 'Glacial Quill Volley chill, Evasive Kiting, Deadly Aim',
  },
  {
    id: 'bramblefist-oakhulk',
    name: 'Thornmaw the Ironroot',
    title: 'the Ironroot',
    act: 1,
    family: 'ironbark',
    kind: Kind.Golem,
    elem: Elem.Earth,
    tier: 5,
    mods: ['extra_strong', 'stone_skin', 'cursed'],
    retinue: { family: 'rootbound', count: 3, kind: Kind.Golem, tier: 3 },
    ai: 'juggernaut_tank',
    visual: { scale: 1.65, tint: 0x6b8e23, auraColor: 0x8fbc8f, crown: 'thorns' },
    signatureAbilities: [
      'Crushing Ironroot Slam: Massive telegraphed windup slam that shatters frontline armor.',
      'Cursed Bark: Inflicts Weaken curse on contact while absorbing heavy physical blows.',
      'Sentinel Wall: Bodyblocks paths to protect backline allies.',
    ],
    summary: 'Crushing Ironroot Slam, Cursed Bark, Sentinel Wall',
  },

  // ================= ACT II: Into the Redmarsh & Dunes =================
  {
    id: 'arc-carapace-vekor',
    name: 'Vekor, the Arc Carapace',
    title: 'the Arc Carapace',
    act: 2,
    family: 'dune-scarab',
    kind: Kind.Imp,
    elem: Elem.Air,
    tier: 4,
    mods: ['lightning_enchanted', 'stone_skin'],
    retinue: { family: 'dune-scarab', count: 4, kind: Kind.Imp, tier: 3 },
    ai: 'ranged_kiter',
    visual: { scale: 1.45, tint: 0xffd700, auraColor: 0xffe066, crown: 'lightning' },
    signatureAbilities: [
      'Electro-Carapace: Discharges high-voltage sparks across the desert sands.',
      'Chitinous Stone Skin: Hardened golden shell with high physical absorption.',
      'Skittering Retreat: Maintains optimal shock distance while kiting pursuers.',
    ],
    summary: 'Electro-Carapace discharge, Chitinous Stone Skin, Skittering Retreat',
  },
  {
    id: 'venomscale-ssorath',
    name: 'Ssorath, the Venom Patriarch',
    title: 'the Venom Patriarch',
    act: 2,
    family: 'claw-viper',
    kind: Kind.Gnoll,
    elem: Elem.Earth,
    tier: 5,
    mods: ['extra_fast', 'lightning_enchanted', 'spectral_hit'],
    retinue: { family: 'claw-viper', count: 4, kind: Kind.Gnoll, tier: 3 },
    ai: 'ambush_lunger',
    visual: { scale: 1.5, tint: 0x00fa9a, auraColor: 0x2ecc71, crown: 'venom' },
    signatureAbilities: [
      'Viper Ambush Charge: Lunges from the flanks at fragile backline casters.',
      'Venomous Spectral Bite: Strikes with elemental and poison-laced fangs.',
      'Serpent Coil: Surrounds targets with a pack of fast Scale Vipers.',
    ],
    summary: 'Viper Ambush Charge, Venomous Spectral Bite, Serpent Coil',
  },
  {
    id: 'ash-embalmer-khepri',
    name: 'Khepri, the Sunken Embalmer',
    title: 'the Sunken Embalmer',
    act: 2,
    family: 'greater-mummy',
    kind: Kind.Mage,
    elem: Elem.Earth,
    tier: 5,
    mods: ['extra_fast', 'cursed', 'mana_burn'],
    retinue: { family: 'hollow-knight', count: 4, kind: Kind.Warrior, tier: 3 },
    ai: 'shaman_reviver',
    visual: { scale: 1.6, tint: 0xd4af37, auraColor: 0x9b59b6, crown: 'skull' },
    signatureAbilities: [
      'Unholy Embalming: Continuously raises fallen Hollow Knights from their crypts.',
      'Pestilent Breath: Clouds of toxic decay and Mana Burn hexes.',
      'Crypt Guard: Protected by disciplined undead Hollow Knights.',
    ],
    summary: 'Unholy Embalming resurrection, Pestilent Breath, Mana Burn hexes',
  },
  {
    id: 'crimson-prowler-zara',
    name: 'Zara, the Crimson Prowler',
    title: 'the Crimson Prowler',
    act: 2,
    family: 'dune-lurker',
    kind: Kind.Gnoll,
    elem: Elem.Fire,
    tier: 4,
    mods: ['extra_strong', 'cursed', 'fire_enchanted'],
    retinue: { family: 'sand-raider', count: 4, kind: Kind.Warrior, tier: 3 },
    ai: 'berserker_charger',
    visual: { scale: 1.42, tint: 0xdc143c, auraColor: 0xff2400, crown: 'blood' },
    signatureAbilities: [
      'Crimson Savagery: Enters an unstoppable berserk frenzy below 40% health.',
      'Cursed Talons: Tears through armor with Weaken curses.',
      'Dune Raider Pack: Leads dual-scimitar Sand Raiders into reckless charges.',
    ],
    summary: 'Crimson Savagery berserk, Cursed Talons, Dune Raider Pack',
  },

  // ================= ACT III: The Iron Coast & Jungles =================
  {
    id: 'bog-hexer-zulmar',
    name: 'Zulmar, High Hexer of the Mire',
    title: 'High Hexer of the Mire',
    act: 3,
    family: 'witch-doctor',
    kind: Kind.Mage,
    elem: Elem.Fire,
    tier: 5,
    mods: ['fire_enchanted', 'magic_resistant', 'blessed_aura'],
    retinue: { family: 'fetish-blowdart', count: 6, kind: Kind.Archer, tier: 3 },
    ai: 'shaman_reviver',
    visual: { scale: 1.48, tint: 0xff8c00, auraColor: 0xff4500, crown: 'skull' },
    signatureAbilities: [
      'Mire Inferno: Channels searing marsh fire and restores injured elites.',
      'Tribal Resurrection: Revives fallen marsh warriors and blesses his retinue.',
      'Dartblower Ambush: Guarded by six rapid-fire Bog Dartblower snipers.',
    ],
    summary: 'Mire Inferno, Tribal Resurrection, Blessed Dartblower Retinue',
  },
  {
    id: 'thunderbough-elder',
    name: 'Elder Thunderbough',
    title: 'the Storm Bough',
    act: 3,
    family: 'stormtree',
    kind: Kind.Golem,
    elem: Elem.Air,
    tier: 5,
    mods: ['lightning_enchanted', 'extra_fast', 'stone_skin'],
    retinue: { family: 'rootbound', count: 4, kind: Kind.Golem, tier: 4 },
    ai: 'juggernaut_tank',
    visual: { scale: 1.7, tint: 0x7df9ff, auraColor: 0x00ffff, crown: 'lightning' },
    signatureAbilities: [
      'Tempest Canopy: Crackling lightning colossus that charges surprisingly fast.',
      'Living Bastion: Intercepts incoming attacks to shield jungle casters.',
      'Thunderous Slam: Crushing area shockwave on heavy melee windup.',
    ],
    summary: 'Tempest Canopy lightning, Living Bastion intercept, Thunderous Slam',
  },
  {
    id: 'cinderweb-arachna',
    name: 'Ignisweb, the Burning Matron',
    title: 'the Burning Matron',
    act: 3,
    family: 'spore-matron',
    kind: Kind.Mage,
    elem: Elem.Fire,
    tier: 4,
    mods: ['fire_enchanted', 'extra_strong', 'cursed'],
    retinue: { family: 'maggot-swarm', count: 5, kind: Kind.Gnoll, tier: 3 },
    ai: 'hexer_caster',
    visual: { scale: 1.5, tint: 0xff3300, auraColor: 0xff6600, crown: 'flame' },
    signatureAbilities: [
      'Venomfire Web: Coats the battlefield in burning poison clouds and curses.',
      'Brood Swarm: Surrounded by toxic Maggot Swarms that scatter if she dies.',
      'Burning Carapace: Explodes with searing heat and extra-strong strikes.',
    ],
    summary: 'Venomfire Web poison/burn hexes, Brood Swarm, Burning Carapace',
  },
  {
    id: 'rimewing-valkor',
    name: 'Valkor, the Rimewing',
    title: 'the Rimewing',
    act: 3,
    family: 'glasswing',
    kind: Kind.Imp,
    elem: Elem.Water,
    tier: 4,
    mods: ['cold_enchanted', 'teleporting', 'extra_fast'],
    retinue: { family: 'rift-moth', count: 4, kind: Kind.Imp, tier: 3 },
    ai: 'ranged_kiter',
    visual: { scale: 1.42, tint: 0x87cefa, auraColor: 0x00bfff, crown: 'frost' },
    signatureAbilities: [
      'Rift Blink: Blinks and kites effortlessly away from melee reach.',
      'Arctic Wing Gust: Fires chilling bolts that freeze and slow pursuers.',
      'Moth Swarm Escort: Flanked by astral-draining Rift Moths.',
    ],
    summary: 'Rift Blink kiting, Arctic Wing Gust chill, Moth Swarm Escort',
  },

  // ================= ACT IV: Crown and Ember =================
  {
    id: 'fallen-warden-azrael',
    name: 'Vaelor, the Shattered Warden',
    title: 'the Shattered Warden',
    act: 4,
    family: 'hollow-king',
    kind: Kind.Warrior,
    elem: Elem.Water,
    tier: 5,
    mods: ['cold_enchanted', 'stone_skin', 'extra_strong'],
    retinue: { family: 'doom-knight', count: 3, kind: Kind.Warrior, tier: 4 },
    ai: 'juggernaut_tank',
    visual: { scale: 1.72, tint: 0x4169e1, auraColor: 0x00ffff, crown: 'frost' },
    signatureAbilities: [
      'Glacial Ward: Envelops the battlefield in a chilling warden aura.',
      'Celestial Bulwark: Immense health pool and stone-skin resilience.',
      'Dread Vanguard: Commands an honor guard of Abyssal Dread Knights.',
    ],
    summary: 'Glacial Ward chill, Celestial Bulwark tank, Dread Vanguard',
  },
  {
    id: 'hellforger-kragg',
    name: 'Kragg, the Cinderforge Overseer',
    title: 'the Cinderforge Overseer',
    act: 4,
    family: 'anvilmaw-smith',
    kind: Kind.Golem,
    elem: Elem.Fire,
    tier: 5,
    mods: ['extra_strong', 'extra_fast', 'spectral_hit', 'magic_resistant'],
    retinue: { family: 'basalt-brute', count: 3, kind: Kind.Golem, tier: 4 },
    ai: 'berserker_charger',
    visual: { scale: 1.75, tint: 0xb22222, auraColor: 0xff4500, crown: 'flame' },
    signatureAbilities: [
      'Cinderforge Hammer: Relentless Extra Strong & Spectral Hit hammer blows.',
      'Cinderforge Sprint: Charges down intruders with unstoppable momentum.',
      'Molten Temper: Forged in magma with high elemental resistances.',
    ],
    summary: 'Cinderforge Hammer spectral strikes, Cinderforge Sprint, Molten Temper',
  },
  {
    id: 'dreadlord-malakor',
    name: 'Lord Varakh, the Seal Keeper',
    title: 'the Seal Keeper',
    act: 4,
    family: 'doom-knight',
    kind: Kind.Warrior,
    elem: Elem.Astral,
    tier: 5,
    mods: ['cursed', 'blessed_aura', 'extra_strong'],
    retinue: { family: 'doom-knight', count: 5, kind: Kind.Warrior, tier: 4 },
    ai: 'hexer_caster',
    visual: { scale: 1.58, tint: 0xffd700, auraColor: 0xda70d6, crown: 'skull' },
    signatureAbilities: [
      'Ashen Hex: Casts Weaken, Slow, and astral hexes from behind his knights.',
      'Zealot Aura: Grants Blessed Aura to his entire Dread Knight retinue.',
      'Citadel Seal Guard: Maintains tactical distance while his knights bodyblock.',
    ],
    summary: 'Ashen Hex curses, Zealot Blessed Aura, Dread Knight phalanx',
  },
  {
    id: 'soulblight-archon',
    name: 'Gorgath, Harvester of Cinders',
    title: 'Harvester of Cinders',
    act: 4,
    family: 'cinderhorn',
    kind: Kind.Imp,
    elem: Elem.Fire,
    tier: 5,
    mods: ['extra_fast', 'fire_enchanted', 'spectral_hit'],
    retinue: { family: 'cinderhorn', count: 5, kind: Kind.Imp, tier: 4 },
    ai: 'berserker_charger',
    visual: { scale: 1.68, tint: 0xff1493, auraColor: 0xff0055, crown: 'flame' },
    signatureAbilities: [
      'Inferno Stampede: Leads a terrifying pack of Extra Fast Cinderhorn fiends.',
      'Soulfire Breath: Spectral fire strikes that scorch both health and spirit.',
      'Ember Fury: Enters berserk rage when wounded, relentlessly hunting the hero.',
    ],
    summary: 'Inferno Stampede blitz, Soulfire Breath, Ember Fury berserk',
  },
] as const;

const SUPER_UNIQUE_MAP = new Map<string, SuperUniqueDef>(SUPER_UNIQUES.map((su) => [su.id, su]));
const SIM_UNIT_SUPER_UNIQUES = new WeakMap<Sim, Map<number, SuperUniqueDef>>();

/** Lookup a Super-Unique definition by its unique id (e.g. 'volt-stalker-krazak', 'pyre-chanter-malgath'). */
export function getSuperUniqueById(id: string): SuperUniqueDef | undefined {
  return SUPER_UNIQUE_MAP.get(id);
}

/** Return the 4 Super-Unique bosses belonging to the specified Act (1..4). */
export function getSuperUniquesForAct(act: 1 | 2 | 3 | 4): readonly SuperUniqueDef[] {
  return SUPER_UNIQUES.filter((su) => su.act === act);
}

/** Synthesize a MonsterFamilyDef for a Super-Unique so data/combat/inspection lookups work seamlessly. */
export function superUniqueAsFamilyDef(id: string): MonsterFamilyDef | undefined {
  const su = SUPER_UNIQUE_MAP.get(id);
  if (!su) return undefined;
  const baseFam = monsterFamilyById(su.family);
  const def = DEFS[su.kind] ?? DEFS[Kind.Gnoll];
  const isCaster = su.ai === 'shaman_reviver' || su.ai === 'hexer_caster' || (baseFam?.caster ?? def.caster);
  const isRanged = su.ai === 'ranged_kiter' || isCaster || (baseFam?.ranged ?? def.ranged);
  return {
    id: su.id,
    name: su.name,
    batch: 'SUPER_UNIQUE',
    archetype: su.kind,
    elem: su.elem,
    baseHp: Math.round((baseFam?.baseHp ?? def.hp) * 1.45),
    baseMin: Math.round((baseFam?.baseMin ?? def.min) * 1.3),
    baseMax: Math.round((baseFam?.baseMax ?? def.max) * 1.3),
    speed: su.mods.includes('extra_fast') ? Math.max(120, (baseFam?.speed ?? def.speed) + 20) : (baseFam?.speed ?? def.speed),
    ranged: isRanged,
    caster: isCaster,
    role: `Act ${su.act} Super-Unique (${su.summary})`,
  };
}

/** Lookup whether a unit in `sim` is a spawned Super-Unique boss. */
export function getSuperUniqueForUnit(sim: Sim, unitId: number): SuperUniqueDef | undefined {
  if (unitId < 0 || unitId >= sim.count) return undefined;
  const bySim = SIM_UNIT_SUPER_UNIQUES.get(sim)?.get(unitId);
  if (bySim) return bySim;
  const famId = sim.cb.family[unitId];
  return famId ? SUPER_UNIQUE_MAP.get(famId) : undefined;
}

export function applyAffixStatBonuses(sim: Sim, u: number, mods: readonly string[]): void {
  const cb = sim.cb;
  const mo = u * MODN;
  for (const bm of mods) {
    switch (bm) {
      case 'fire_enchanted':
        cb.mod[mo + M.Min] += 4;
        cb.mod[mo + M.Max] += 6;
        cb.mod[mo + M.Res + 0] += 50;
        cb.hpMax[u] = Math.min(32000, Math.round(cb.hpMax[u] * 1.15));
        break;
      case 'cold_enchanted':
        cb.mod[mo + M.Min] += 3;
        cb.mod[mo + M.Max] += 5;
        cb.mod[mo + M.Res + 1] += 50;
        cb.hpMax[u] = Math.min(32000, Math.round(cb.hpMax[u] * 1.15));
        break;
      case 'lightning_enchanted':
        cb.mod[mo + M.Min] += 2;
        cb.mod[mo + M.Max] += 8;
        cb.mod[mo + M.Res + 2] += 50;
        cb.hpMax[u] = Math.min(32000, Math.round(cb.hpMax[u] * 1.15));
        break;
      case 'extra_fast':
        cb.mod[mo + M.Acc] += 3;
        cb.mod[mo + M.Def] += 3;
        cb.hpMax[u] = Math.min(32000, Math.round(cb.hpMax[u] * 1.1));
        break;
      case 'extra_strong':
        cb.mod[mo + M.Min] += 6;
        cb.mod[mo + M.Max] += 10;
        cb.mod[mo + M.Acc] += 3;
        cb.hpMax[u] = Math.min(32000, Math.round(cb.hpMax[u] * 1.2));
        break;
      case 'stone_skin':
        cb.mod[mo + M.Def] += 4;
        cb.mod[mo + M.Abs] += 3;
        cb.hpMax[u] = Math.min(32000, Math.round(cb.hpMax[u] * 1.25));
        break;
      case 'magic_resistant':
        for (let r = 0; r < 5; r++) cb.mod[mo + M.Res + r] += 30;
        cb.hpMax[u] = Math.min(32000, Math.round(cb.hpMax[u] * 1.15));
        break;
      case 'spectral_hit':
        cb.mod[mo + M.Acc] += 5;
        cb.mod[mo + M.Min] += 3;
        cb.mod[mo + M.Max] += 5;
        cb.mod[mo + M.Res + 4] += 40;
        break;
      case 'blessed_aura':
        cb.mod[mo + M.Min] += 4;
        cb.mod[mo + M.Max] += 4;
        cb.mod[mo + M.Def] += 2;
        cb.mod[mo + M.Regen] += 2;
        break;
      case 'cursed':
        cb.mod[mo + M.Min] += 3;
        cb.mod[mo + M.Max] += 5;
        cb.mod[mo + M.Acc] += 4;
        break;
      case 'mana_burn':
        cb.mod[mo + M.Min] += 3;
        cb.mod[mo + M.Max] += 6;
        cb.mod[mo + M.Res + 4] += 35;
        break;
      case 'teleporting':
        cb.mod[mo + M.Def] += 5;
        break;
    }
  }
}

/**
 * Transform a pack (or list of unit IDs) into a Thornvael Super-Unique boss encounter
 * with its signature affixes, tier, spells, and matching minion retinue.
 */
export function spawnSuperUniqueInPack(
  sim: Sim,
  packOrIds: Pack | readonly number[],
  superUnique: string | SuperUniqueDef,
): { leaderId: number; retinueIds: number[]; def: SuperUniqueDef } | null {
  const def = typeof superUnique === 'string' ? getSuperUniqueById(superUnique) : superUnique;
  if (!def) return null;

  const ids = Array.isArray(packOrIds) ? packOrIds : (packOrIds as Pack).ids;
  if (!ids || ids.length === 0) return null;

  const leaderId = ids[0];
  if (leaderId < 0 || leaderId >= sim.count) return null;

  const cb = sim.cb;
  const baseFam = monsterFamilyById(def.family);
  const pal = monsterPaletteByTier(def.tier);
  const hpMult = (pal?.hpMult ?? 2.25) * 1.45;
  const dmgMult = (pal?.dmgMult ?? 1.9) * 1.3;

  (cb.kind as Uint8Array)[leaderId] = def.kind;
  (cb.family as string[])[leaderId] = def.id;
  (cb.tier as Uint8Array)[leaderId] = def.tier;
  (cb.bossMods as string[][])[leaderId] = [...def.mods];

  const rawHp = baseFam ? baseFam.baseHp : DEFS[def.kind].hp;
  const rawMin = baseFam ? baseFam.baseMin : DEFS[def.kind].min;
  const rawMax = baseFam ? baseFam.baseMax : DEFS[def.kind].max;

  const mo = leaderId * MODN;
  cb.hpMax[leaderId] = Math.min(32000, Math.round(rawHp * hpMult));
  cb.mod[mo + M.Min] = Math.round(rawMin * dmgMult) - DEFS[def.kind].min;
  cb.mod[mo + M.Max] = Math.round(rawMax * dmgMult) - DEFS[def.kind].max;

  applyAffixStatBonuses(sim, leaderId, def.mods);
  cb.hp[leaderId] = cb.hpMax[leaderId];

  const isCaster = def.ai === 'shaman_reviver' || def.ai === 'hexer_caster' || (baseFam?.caster ?? DEFS[def.kind].caster);
  if (isCaster) {
    cb.manaMax[leaderId] = Math.max(cb.manaMax[leaderId], 120);
    cb.mana[leaderId] = cb.manaMax[leaderId];
    cb.known[leaderId] |= MAGE_SPELLS | (1 << 17); // Includes Resurrect (24), Weaken (20/23), Frost Bolt (4), Fire Bolt (0), Healing (7), Poison Cloud (17)
  }

  let unitMap = SIM_UNIT_SUPER_UNIQUES.get(sim);
  if (!unitMap) {
    unitMap = new Map<number, SuperUniqueDef>();
    SIM_UNIT_SUPER_UNIQUES.set(sim, unitMap);
  }
  unitMap.set(leaderId, def);

  // Configure retinue minions in the rest of the pack
  const retinueIds: number[] = [];
  const retFam = monsterFamilyById(def.retinue.family);
  const retPal = monsterPaletteByTier(def.retinue.tier);
  const retHpMult = retPal?.hpMult ?? 1.35;
  const retDmgMult = retPal?.dmgMult ?? 1.25;

  const maxRetinue = Math.min(ids.length - 1, def.retinue.count);
  for (let idx = 1; idx <= maxRetinue; idx++) {
    const mId = ids[idx];
    if (mId < 0 || mId >= sim.count) continue;
    (cb.kind as Uint8Array)[mId] = def.retinue.kind;
    (cb.family as string[])[mId] = def.retinue.family;
    (cb.tier as Uint8Array)[mId] = def.retinue.tier;
    (cb.bossMods as string[][])[mId] = [];

    const mRawHp = retFam ? retFam.baseHp : DEFS[def.retinue.kind].hp;
    const mRawMin = retFam ? retFam.baseMin : DEFS[def.retinue.kind].min;
    const mRawMax = retFam ? retFam.baseMax : DEFS[def.retinue.kind].max;

    const mMo = mId * MODN;
    cb.hpMax[mId] = Math.min(32000, Math.round(mRawHp * retHpMult));
    cb.hp[mId] = cb.hpMax[mId];
    cb.mod[mMo + M.Min] = Math.round(mRawMin * retDmgMult) - DEFS[def.retinue.kind].min;
    cb.mod[mMo + M.Max] = Math.round(mRawMax * retDmgMult) - DEFS[def.retinue.kind].max;

    if (retFam?.caster || DEFS[def.retinue.kind].caster) {
      cb.manaMax[mId] = Math.max(cb.manaMax[mId], 45);
      cb.mana[mId] = cb.manaMax[mId];
      cb.known[mId] |= DEFS[def.retinue.kind].known || 1 << 0;
    }
    retinueIds.push(mId);
  }

  return { leaderId, retinueIds, def };
}
