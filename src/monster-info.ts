import { DEFS, Kind, type KindDef } from './sim/combat';
import { monsterFamilyById, monsterPaletteByTier } from './sim/data';
import { FP, TICKS_PER_SECOND } from './sim/sim';

const ELEMENTS = ['Physical', 'Fire', 'Water', 'Air', 'Earth', 'Astral'] as const;
const PARTS = ['Head', 'Torso', 'Arms', 'Legs'] as const;

export const BOSS_MOD_LABELS: Record<string, string> = {
  fire_enchanted: 'Fire Enchanted',
  cold_enchanted: 'Cold Enchanted',
  lightning_enchanted: 'Lightning Enchanted',
  extra_fast: 'Extra Fast',
  extra_strong: 'Extra Strong',
  stone_skin: 'Stone Skin',
  magic_resistant: 'Magic Resistant',
  spectral_hit: 'Spectral Hit',
  mana_burn: 'Mana Burn',
  cursed: 'Cursed',
  blessed_aura: 'Blessed Aura',
  teleporting: 'Teleporting',
};

export interface MonsterInfo {
  readonly kind: number;
  readonly name: string;
  readonly tier?: number;
  readonly family?: string;
  readonly role?: string;
  readonly mods?: readonly string[];
  readonly element?: string;
  /** Base family values, not a unit's current HP, equipment or status modifiers. */
  readonly base: Readonly<KindDef>;
  readonly text: string;
}

/** Convenient lookup by family identifier directly. */
export function monsterInfoByFamily(familyId: string, tier = 1, bossMods: readonly string[] = []): MonsterInfo | null {
  const fam = monsterFamilyById(familyId);
  if (!fam) return null;
  return monsterInfo(fam.archetype, tier, familyId, bossMods);
}

/** Current enemy roster and monster families lookup. For Archer, the caller must establish hostility. */
export function monsterInfo(kind: number, tier = 1, familyId = '', bossMods: readonly string[] = []): MonsterInfo | null {
  const fam = familyId ? monsterFamilyById(familyId) : undefined;
  const def = DEFS[kind] ?? (fam ? DEFS[fam.archetype] : undefined);
  if (!def) return null;
  if (!fam && kind !== Kind.Gnoll && kind !== Kind.Golem && kind !== Kind.Imp && kind !== Kind.Archer) return null;
  const modLabels = bossMods.map((m) => BOSS_MOD_LABELS[m] || m);
  if (tier === 1 && !fam && bossMods.length === 0) {
    // Detached, frozen arrays prevent a presentation consumer from editing combat definitions.
    const base: Readonly<KindDef> = Object.freeze({
      ...def,
      pdef: Object.freeze([...def.pdef]) as KindDef['pdef'],
      pabs: Object.freeze([...def.pabs]) as KindDef['pabs'],
      res: Object.freeze([...def.res]) as KindDef['res'],
    });
    const armour = PARTS.map((part, i) => `${part}: ${base.pdef[i]} armour / ${base.pabs[i]} absorption`).join('; ');
    const resistance = base.res.map((value, i) => `${ELEMENTS[i + 1]} ${value}%`).join(', ');
    const text = [
      `${base.name} — base family stats.`,
      `HP ${base.hp}; mana ${base.mana}.`,
      `${base.ranged ? 'Ranged' : 'Melee'} ${ELEMENTS[base.elem]} attack: ${base.min}–${base.max}; accuracy ${base.acc}; range ${base.reach / FP} tiles; interval ${base.cd} ticks (${base.cd / TICKS_PER_SECOND}s).`,
      `Walking speed ${base.speed}% of base; dodge ${base.def}.`,
      `${armour}.`,
      `School resistance (negative means vulnerability): ${resistance}.`,
      base.caster ? 'Spellcaster; known spell mask and default autocast are in base. Spell details come from the installed spell table.' : 'No spellcasting.',
    ].join('\n');
    return Object.freeze({ kind, name: base.name, element: ELEMENTS[base.elem], base, text });
  }

  const clampedTier = Math.max(1, Math.min(5, Math.trunc(tier)));
  const pal = monsterPaletteByTier(clampedTier);
  const hpMult = pal?.hpMult ?? 1;
  const dmgMult = pal?.dmgMult ?? 1;
  const rawHp = fam ? fam.baseHp : def.hp;
  const rawMin = fam ? fam.baseMin : def.min;
  const rawMax = fam ? fam.baseMax : def.max;
  const hp = Math.round(rawHp * hpMult);
  const min = Math.round(rawMin * dmgMult);
  const max = Math.round(rawMax * dmgMult);
  const speed = fam ? fam.speed : def.speed;
  const elem = fam ? fam.elem : def.elem;
  const ranged = fam ? fam.ranged : def.ranged;
  const caster = fam ? fam.caster : def.caster;
  const familyName = fam ? fam.name : def.name;
  const tierLabel = pal ? `Tier ${clampedTier} ${pal.label}` : `Tier ${clampedTier}`;
  const prefix = modLabels.length > 0 ? `${modLabels.join(', ')} ` : '';
  const displayName = `${prefix}${familyName} (${tierLabel})`;

  const base: Readonly<KindDef> = Object.freeze({
    ...def,
    name: familyName,
    hp,
    min,
    max,
    speed,
    elem,
    ranged,
    caster,
    pdef: Object.freeze([...def.pdef]) as KindDef['pdef'],
    pabs: Object.freeze([...def.pabs]) as KindDef['pabs'],
    res: Object.freeze([...def.res]) as KindDef['res'],
  });
  const armour = PARTS.map((part, i) => `${part}: ${base.pdef[i]} armour / ${base.pabs[i]} absorption`).join('; ');
  const resistance = base.res.map((value, i) => `${ELEMENTS[i + 1]} ${value}%`).join(', ');
  const modLines = modLabels.length > 0 ? [`Elite affixes: ${modLabels.join(', ')}.`] : [];
  const text = [
    `${displayName}${fam?.role ? ` — ${fam.role}` : ''} — base family stats.`,
    ...modLines,
    `HP ${base.hp}; mana ${base.mana}.`,
    `${base.ranged ? 'Ranged' : 'Melee'} ${ELEMENTS[base.elem]} attack: ${base.min}–${base.max}; accuracy ${base.acc}; range ${base.reach / FP} tiles; interval ${base.cd} ticks (${base.cd / TICKS_PER_SECOND}s).`,
    `Walking speed ${base.speed}% of base; dodge ${base.def}.`,
    `${armour}.`,
    `School resistance (negative means vulnerability): ${resistance}.`,
    base.caster ? 'Spellcaster; known spell mask and default autocast are in base. Spell details come from the installed spell table.' : 'No spellcasting.',
  ].join('\n');
  return Object.freeze({
    kind,
    name: displayName,
    tier: clampedTier,
    element: ELEMENTS[base.elem],
    ...(fam ? { family: fam.id, role: fam.role } : {}),
    ...(modLabels.length > 0 ? { mods: modLabels } : {}),
    base,
    text,
  });
}
