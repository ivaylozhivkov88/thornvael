import { DEFS, Kind, type KindDef } from './sim/combat';
import { FP, TICKS_PER_SECOND } from './sim/sim';

const ELEMENTS = ['Physical', 'Fire', 'Water', 'Air', 'Earth', 'Astral'] as const;
const PARTS = ['Head', 'Torso', 'Arms', 'Legs'] as const;

export interface MonsterInfo {
  readonly kind: number;
  readonly name: string;
  /** Base family values, not a unit's current HP, equipment or status modifiers. */
  readonly base: Readonly<KindDef>;
  readonly text: string;
}

/** Current enemy roster only. For Archer, the caller must establish hostility. */
export function monsterInfo(kind: number): MonsterInfo | null {
  if (kind !== Kind.Gnoll && kind !== Kind.Golem && kind !== Kind.Imp && kind !== Kind.Archer) return null;
  const def = DEFS[kind];
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
  return Object.freeze({ kind, name: base.name, base, text });
}
