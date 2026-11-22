/**
 * Typed audio catalog mapping all Thornvael music themes and SFX categories
 * to their canonical `public/audio/<id>.m4a` asset IDs.
 */

export type MusicCategory =
  | 'menu'
  | 'char_select'
  | 'hub'
  | 'explore'
  | 'battle'
  | 'boss'
  | 'skirmish'
  | 'cutscene'
  | 'outcome'
  | 'stinger';

export interface MusicTrackEntry {
  readonly id: string;
  readonly category: MusicCategory;
  readonly loop: boolean;
  readonly act?: 1 | 2 | 3 | 4;
  readonly biome?: string;
}

export const MUSIC_MENU = {
  mainMenu: 'music_main_menu',
  charSelect: 'music_char_select',
} as const;

export const MUSIC_HUBS = {
  generic: 'music_town',
  act1: 'music_town_thornwick',
  act2: 'music_town_redmarsh',
  act3: 'music_town_oakhaven',
  act4: 'music_town_ironcamp',
} as const;

export const MUSIC_EXPLORE = {
  generic: 'music_explore',
  act1: [
    'music_explore_act1_fords',
    'music_explore_act1_fen',
    'music_explore_act1_kilns',
  ],
  act2: [
    'music_explore_act2_canyon',
    'music_explore_act2_marsh',
    'music_explore_act2_vaults',
  ],
  act3: [
    'music_explore_act3_coast',
    'music_explore_act3_citadel',
    'music_explore_act3_spit',
  ],
  act4: [
    'music_explore_act4_heartland',
    'music_explore_act4_rampart',
    'music_explore_act4_caldera',
  ],
} as const;

export const MUSIC_BATTLE = {
  generic: 'music_battle',
  act1: 'music_battle_act1',
  act2: 'music_battle_act2',
  act3: 'music_battle_act3',
  act4: 'music_battle_act4',
  elite: 'music_battle_elite',
} as const;

export const MUSIC_BOSS = {
  morvessa: 'music_boss_morvessa',
  gorrathul: 'music_boss_gorrathul',
  vesperion: 'music_boss_vesperion',
  ashkarath: 'music_boss_ashkarath',
  ashkarathPhase2: 'music_boss_ashkarath_phase2',
} as const;

export const MUSIC_SKIRMISH = {
  forest: 'music_skirmish_forest',
  marsh: 'music_skirmish_marsh',
  desert: 'music_skirmish_desert',
  crypt: 'music_skirmish_crypt',
  volcanic: 'music_skirmish_volcanic',
} as const;

export const MUSIC_OUTCOME = {
  victory: 'music_victory',
  defeat: 'music_defeat',
  cutsceneCrown: 'music_cutscene_crown',
  cutsceneOmen: 'music_cutscene_omen',
  lowHpStinger: 'music_stinger_low_hp',
} as const;

export const MUSIC_ENDINGS = {
  crown: 'music_ending_crown',
  ember: 'music_ending_ember',
} as const;

export const WAVE2_MUSIC_TRACKS: readonly MusicTrackEntry[] = [
  { id: MUSIC_ENDINGS.crown, category: 'outcome', loop: true, act: 4 },
  { id: MUSIC_ENDINGS.ember, category: 'outcome', loop: true, act: 4 },
];

export const ALL_MUSIC_TRACKS: readonly MusicTrackEntry[] = [
  { id: MUSIC_MENU.mainMenu, category: 'menu', loop: true },
  { id: MUSIC_MENU.charSelect, category: 'char_select', loop: true },

  { id: MUSIC_HUBS.generic, category: 'hub', loop: true },
  { id: MUSIC_HUBS.act1, category: 'hub', loop: true, act: 1 },
  { id: MUSIC_HUBS.act2, category: 'hub', loop: true, act: 2 },
  { id: MUSIC_HUBS.act3, category: 'hub', loop: true, act: 3 },
  { id: MUSIC_HUBS.act4, category: 'hub', loop: true, act: 4 },

  { id: MUSIC_EXPLORE.generic, category: 'explore', loop: true },
  ...MUSIC_EXPLORE.act1.map((id) => ({ id, category: 'explore' as const, loop: true, act: 1 as const })),
  ...MUSIC_EXPLORE.act2.map((id) => ({ id, category: 'explore' as const, loop: true, act: 2 as const })),
  ...MUSIC_EXPLORE.act3.map((id) => ({ id, category: 'explore' as const, loop: true, act: 3 as const })),
  ...MUSIC_EXPLORE.act4.map((id) => ({ id, category: 'explore' as const, loop: true, act: 4 as const })),

  { id: MUSIC_BATTLE.generic, category: 'battle', loop: true },
  { id: MUSIC_BATTLE.act1, category: 'battle', loop: true, act: 1 },
  { id: MUSIC_BATTLE.act2, category: 'battle', loop: true, act: 2 },
  { id: MUSIC_BATTLE.act3, category: 'battle', loop: true, act: 3 },
  { id: MUSIC_BATTLE.act4, category: 'battle', loop: true, act: 4 },
  { id: MUSIC_BATTLE.elite, category: 'battle', loop: true },

  { id: MUSIC_BOSS.morvessa, category: 'boss', loop: true, act: 1 },
  { id: MUSIC_BOSS.gorrathul, category: 'boss', loop: true, act: 2 },
  { id: MUSIC_BOSS.vesperion, category: 'boss', loop: true, act: 3 },
  { id: MUSIC_BOSS.ashkarath, category: 'boss', loop: true, act: 4 },
  { id: MUSIC_BOSS.ashkarathPhase2, category: 'boss', loop: true, act: 4 },

  { id: MUSIC_SKIRMISH.forest, category: 'skirmish', loop: true, biome: 'forest' },
  { id: MUSIC_SKIRMISH.marsh, category: 'skirmish', loop: true, biome: 'marsh' },
  { id: MUSIC_SKIRMISH.desert, category: 'skirmish', loop: true, biome: 'desert' },
  { id: MUSIC_SKIRMISH.crypt, category: 'skirmish', loop: true, biome: 'crypt' },
  { id: MUSIC_SKIRMISH.volcanic, category: 'skirmish', loop: true, biome: 'volcanic' },

  { id: MUSIC_OUTCOME.victory, category: 'outcome', loop: false },
  { id: MUSIC_OUTCOME.defeat, category: 'outcome', loop: false },
  { id: MUSIC_OUTCOME.cutsceneCrown, category: 'cutscene', loop: false },
  { id: MUSIC_OUTCOME.cutsceneOmen, category: 'cutscene', loop: false },
  { id: MUSIC_OUTCOME.lowHpStinger, category: 'stinger', loop: false },
];

export const ALL_CATALOG_MUSIC_TRACKS: readonly MusicTrackEntry[] = [
  ...ALL_MUSIC_TRACKS,
  ...WAVE2_MUSIC_TRACKS,
];

export const SFX_UI = {
  click: 'click',
  buttonClick: 'ui_button_click',
  buttonHover: 'ui_button_hover',
  error: 'ui_error',
  menuOpen: 'ui_menu_open',
  menuClose: 'ui_menu_close',
  invPick: 'ui_inv_pick',
  invEquip: 'ui_inv_equip',
  invDrop: 'ui_inv_drop',
  tradeBuy: 'ui_trade_buy',
  tradeSell: 'ui_trade_sell',
  ledgerLatch: 'ledger_latch_01',
  selectHero: 'select_hero',
  gold: 'gold',
  gameSave: 'sfx_game_save',
  achievement: 'sfx_achievement',
  questAccept: 'sfx_quest_accept',
  questComplete: 'sfx_quest_complete',
  questFail: 'sfx_quest_fail',
  levelUp: 'sfx_level_up',
  unitSelect: 'sfx_unit_select',
  cmdAttack: 'sfx_cmd_attack',
  cmdHold: 'sfx_cmd_hold',
  cmdMove: 'sfx_cmd_move',
  cooldownReady: 'sfx_cooldown_ready',
  manaEmpty: 'sfx_mana_empty',
  lowHealth: 'sfx_low_health',
  waypointActivate: 'sfx_waypoint_activate',
  secretReveal: 'sfx_secret_reveal',
} as const;

export const SFX_FOOTSTEPS = {
  generic: ['step1', 'step2'],
  grass: ['step_grass_1', 'step_grass_2', 'step_grass_3'],
  dirt: ['step_dirt_1', 'step_dirt_2', 'step_dirt_3'],
  water: ['step_water_1', 'step_water_2'],
  marsh: ['step_marsh_mud_1', 'step_marsh_mud_2'],
  stone: ['step_stone_1', 'step_stone_2'],
  snow: ['step_snow_1', 'step_snow_2'],
  ash: ['step_ash_1', 'step_ash_2'],
  snowAsh: ['step_snow_ash_1', 'step_snow_ash_2'],
  wood: ['step_wood_plank_1', 'step_wood_plank_2'],
} as const;

export type MonsterAudioFamily = 'beast' | 'undead' | 'skeleton' | 'caster' | 'construct' | 'insect';

export const SFX_MONSTER_VOICES = {
  aggro: {
    beast: 'mon_aggro_beast',
    undead: 'mon_aggro_undead',
    skeleton: 'mon_aggro_undead',
    caster: 'mon_aggro_caster',
    construct: 'mon_aggro_construct',
    insect: 'mon_aggro_beast',
  },
  hit: {
    beast: 'mon_hit_beast',
    undead: 'mon_hit_undead',
    skeleton: 'mon_hit_undead',
    caster: 'mon_hit_caster',
    construct: 'mon_hit_construct',
    insect: 'mon_hit_insect',
  },
  death: {
    beast: 'death_beast_1',
    skeleton: 'death_skeleton_1',
    undead: 'death_undead_1',
    caster: 'death_caster_1',
    construct: 'death_construct_1',
    insect: 'death_insect_1',
    default: 'death',
  },
} as const;

export const SFX_NPC_BARKS = {
  smith: 'bark_smith',
  innkeeper: 'bark_innkeeper',
  mage: 'bark_mage',
  priest: 'bark_priest',
  guard: 'bark_guard',
  merchant: 'bark_merchant',
} as const;

export const SFX_MERC_BARKS = {
  warrior: 'bark_merc_warrior',
  archer: 'bark_merc_archer',
  mage: 'bark_merc_mage',
} as const;

export const SFX_BOSS_ROARS = {
  morvessa: 'boss_roar_morvessa',
  gorrathul: 'boss_roar_gorrathul',
  vesperion: 'boss_roar_vesperion',
  ashkarath: 'boss_roar_ashkarath',
} as const;

export const WAVE2_SFX_IDS: readonly string[] = [
  ...Object.values(SFX_NPC_BARKS),
  ...Object.values(SFX_MERC_BARKS),
  'mon_hit_beast',
  'mon_hit_undead',
  'mon_hit_caster',
  'mon_hit_construct',
  'mon_hit_insect',
  ...Object.values(SFX_BOSS_ROARS),
];

export const SFX_SPELL_SCHOOLS = {
  fire: 'cast_fire',
  water: 'cast_water',
  air: 'cast_air',
  earth: 'cast_earth',
  astral: 'cast_astral',
} as const;

export const SPELL_SLUGS = [
  'fire_bolt', 'fireball', 'flame_burst', 'ignite',
  'frost_bolt', 'ice_storm', 'chain_frost', 'healing', 'healing_rain',
  'lightning', 'chain_lightning', 'haste', 'gale', 'wind_ward',
  'rock_throw', 'stone_curse', 'stone_skin', 'poison_cloud',
  'quake', 'blessing', 'weaken', 'resurrect', 'corpse_burst', 'meditation',
  'meteor', 'inferno', 'blizzard', 'thunderstorm',
  'iron_skin', 'acid_rain', 'mana_burn', 'time_warp',
] as const;

export const SFX_SPELLS: Readonly<Record<(typeof SPELL_SLUGS)[number], { cast: string; impact: string }>> =
  Object.fromEntries(
    SPELL_SLUGS.map((slug) => [
      slug,
      { cast: `sfx_spell_${slug}_cast`, impact: `sfx_spell_${slug}_impact` },
    ]),
  ) as Readonly<Record<(typeof SPELL_SLUGS)[number], { cast: string; impact: string }>>;

export const SFX_LOOT_RARITY = {
  normal: 'loot_normal',
  common: 'loot_normal',
  magic: 'loot_magic',
  rare: 'loot_rare',
  set: 'loot_set',
  unique: 'loot_unique',
  rune: 'rune_reveal',
} as const;

export const SFX_AMBIENT_WEATHER = {
  rain: 'amb_weather_rain',
  embers: 'amb_weather_embers',
  marketCrowd: 'town_market_crowd',
  anvil: 'town_anvil_hammer',
  cart: 'town_cart_wheel',
  tavern: 'town_tavern_murmur',
  watchBell: 'town_watch_bell',
} as const;

export const ALL_ON_DEMAND_SFX_IDS: readonly string[] = Array.from(
  new Set([
    ...WAVE2_SFX_IDS,
    ...Object.values(SFX_UI),
    ...Object.values(SFX_FOOTSTEPS).flat(),
    ...Object.values(SFX_MONSTER_VOICES.aggro),
    ...Object.values(SFX_MONSTER_VOICES.death),
    ...Object.values(SFX_SPELL_SCHOOLS),
    ...Object.values(SFX_SPELLS).flatMap((pair) => [pair.cast, pair.impact]),
    ...Object.values(SFX_LOOT_RARITY),
    ...Object.values(SFX_AMBIENT_WEATHER),
    'sfx_chest_open',
    'sfx_door_heavy',
    'sfx_trap_trigger',
  ]),
);

export function audioAssetPath(id: string, baseUrl = '/thornvael/'): string {
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${cleanBase}audio/${id}.m4a`;
}

export function getMusicForAct(act: number, mode: 'explore' | 'battle' | 'town', regionIndex = 0): string {
  if (mode === 'town') {
    if (act === 1) return MUSIC_HUBS.act1;
    if (act === 2) return MUSIC_HUBS.act2;
    if (act === 3) return MUSIC_HUBS.act3;
    if (act === 4) return MUSIC_HUBS.act4;
    return MUSIC_HUBS.generic;
  }
  if (mode === 'battle') {
    if (act === 1) return MUSIC_BATTLE.act1;
    if (act === 2) return MUSIC_BATTLE.act2;
    if (act === 3) return MUSIC_BATTLE.act3;
    if (act === 4) return MUSIC_BATTLE.act4;
    return MUSIC_BATTLE.generic;
  }
  const idx = Math.abs(regionIndex) % 3;
  if (act === 1) return MUSIC_EXPLORE.act1[idx];
  if (act === 2) return MUSIC_EXPLORE.act2[idx];
  if (act === 3) return MUSIC_EXPLORE.act3[idx];
  if (act === 4) return MUSIC_EXPLORE.act4[idx];
  return MUSIC_EXPLORE.generic;
}

export function getMusicForSkirmish(biome: string): string {
  const key = biome.toLowerCase();
  if (key in MUSIC_SKIRMISH) return MUSIC_SKIRMISH[key as keyof typeof MUSIC_SKIRMISH];
  if (key === 'highlands') return MUSIC_SKIRMISH.forest;
  if (key === 'oasis') return MUSIC_SKIRMISH.desert;
  return MUSIC_SKIRMISH.forest;
}

export function getBossMusic(bossId: string, phase: 1 | 2 = 1): string {
  const key = bossId.toLowerCase();
  if (key.includes('ashkarath')) {
    return phase === 2 ? MUSIC_BOSS.ashkarathPhase2 : MUSIC_BOSS.ashkarath;
  }
  if (key.includes('morvessa')) return MUSIC_BOSS.morvessa;
  if (key.includes('gorrathul')) return MUSIC_BOSS.gorrathul;
  if (key.includes('vesperion')) return MUSIC_BOSS.vesperion;
  return MUSIC_BATTLE.elite;
}

export function getFootstepPool(surface: string): readonly string[] {
  const s = surface.toLowerCase();
  if (s.includes('snow')) return SFX_FOOTSTEPS.snow;
  if (s.includes('ash') || s.includes('cinder') || s.includes('volcan')) return SFX_FOOTSTEPS.ash;
  if (s.includes('marsh') || s.includes('bog') || s.includes('swamp')) return SFX_FOOTSTEPS.marsh;
  if (s.includes('water') || s.includes('ford') || s.includes('river')) return SFX_FOOTSTEPS.water;
  if (s.includes('wood') || s.includes('plank') || s.includes('bridge')) return SFX_FOOTSTEPS.wood;
  if (s.includes('stone') || s.includes('rock') || s.includes('ruin') || s.includes('crypt')) return SFX_FOOTSTEPS.stone;
  if (s.includes('dirt') || s.includes('sand') || s.includes('mud')) return SFX_FOOTSTEPS.dirt;
  if (s.includes('grass') || s.includes('forest')) return SFX_FOOTSTEPS.grass;
  return SFX_FOOTSTEPS.generic;
}

export function getMonsterAggroSfx(family: string): string {
  const f = family.toLowerCase();
  if (f.includes('construct') || f.includes('golem') || f.includes('colossus') || f.includes('brute')) {
    return SFX_MONSTER_VOICES.aggro.construct;
  }
  if (f.includes('caster') || f.includes('shaman') || f.includes('mage') || f.includes('witch') || f.includes('wisp')) {
    return SFX_MONSTER_VOICES.aggro.caster;
  }
  if (f.includes('undead') || f.includes('skel') || f.includes('mummy') || f.includes('knight') || f.includes('hollow')) {
    return SFX_MONSTER_VOICES.aggro.undead;
  }
  return SFX_MONSTER_VOICES.aggro.beast;
}

export function getMonsterDeathSfx(family: string): string {
  const f = family.toLowerCase();
  if (f.includes('construct') || f.includes('golem') || f.includes('colossus')) {
    return SFX_MONSTER_VOICES.death.construct;
  }
  if (f.includes('caster') || f.includes('shaman') || f.includes('mage') || f.includes('witch')) {
    return SFX_MONSTER_VOICES.death.caster;
  }
  if (f.includes('insect') || f.includes('scarab') || f.includes('maggot') || f.includes('moth') || f.includes('mite')) {
    return SFX_MONSTER_VOICES.death.insect;
  }
  if (f.includes('skel') || f.includes('bone')) {
    return SFX_MONSTER_VOICES.death.skeleton;
  }
  if (f.includes('undead') || f.includes('mummy') || f.includes('hollow')) {
    return SFX_MONSTER_VOICES.death.undead;
  }
  if (f.includes('beast') || f.includes('hound') || f.includes('boar') || f.includes('stag') || f.includes('viper')) {
    return SFX_MONSTER_VOICES.death.beast;
  }
  return SFX_MONSTER_VOICES.death.default;
}

export function getLootRaritySfx(rarity: string): string {
  const r = rarity.toLowerCase();
  if (r in SFX_LOOT_RARITY) return SFX_LOOT_RARITY[r as keyof typeof SFX_LOOT_RARITY];
  return SFX_LOOT_RARITY.normal;
}

export function getNpcBarkSfx(role: string): string {
  const r = role.toLowerCase();
  if (r.includes('smith') || r.includes('forge') || r.includes('anvil') || r.includes('hobb') || r.includes('vok')) {
    return SFX_NPC_BARKS.smith;
  }
  if (r.includes('inn') || r.includes('barkeep') || r.includes('tavern') || r.includes('ale')) {
    return SFX_NPC_BARKS.innkeeper;
  }
  if (r.includes('mage') || r.includes('alchem') || r.includes('scholar') || r.includes('zahra') || r.includes('quillon') || r.includes('marta')) {
    return SFX_NPC_BARKS.mage;
  }
  if (r.includes('priest') || r.includes('heal') || r.includes('penitent') || r.includes('sera') || r.includes('elias') || r.includes('orlen')) {
    return SFX_NPC_BARKS.priest;
  }
  if (r.includes('guard') || r.includes('captain') || r.includes('warden') || r.includes('command') || r.includes('garrick') || r.includes('hale') || r.includes('lyra') || r.includes('rowan')) {
    return SFX_NPC_BARKS.guard;
  }
  return SFX_NPC_BARKS.merchant;
}

export function getMercBarkSfx(archetype: string): string {
  const a = archetype.toLowerCase();
  if (a.includes('archer') || a.includes('bow') || a.includes('poacher') || a.includes('arbalest') || a.includes('ranger')) {
    return SFX_MERC_BARKS.archer;
  }
  if (a.includes('mage') || a.includes('novice') || a.includes('channeler') || a.includes('acolyte') || a.includes('notary') || a.includes('caster')) {
    return SFX_MERC_BARKS.mage;
  }
  return SFX_MERC_BARKS.warrior;
}

export function getMonsterHitSfx(family: string): string {
  const f = family.toLowerCase();
  if (f.includes('construct') || f.includes('golem') || f.includes('colossus') || f.includes('brute') || f.includes('flintback')) {
    return SFX_MONSTER_VOICES.hit.construct;
  }
  if (f.includes('caster') || f.includes('shaman') || f.includes('mage') || f.includes('witch') || f.includes('wisp') || f.includes('weaver')) {
    return SFX_MONSTER_VOICES.hit.caster;
  }
  if (f.includes('insect') || f.includes('scarab') || f.includes('maggot') || f.includes('moth') || f.includes('mite') || f.includes('crab')) {
    return SFX_MONSTER_VOICES.hit.insect;
  }
  if (f.includes('undead') || f.includes('skel') || f.includes('bone') || f.includes('mummy') || f.includes('hollow') || f.includes('knight')) {
    return SFX_MONSTER_VOICES.hit.undead;
  }
  return SFX_MONSTER_VOICES.hit.beast;
}

export function getBossRoarSfx(bossId: string): string | null {
  const b = bossId.toLowerCase();
  if (b.includes('morvessa')) return SFX_BOSS_ROARS.morvessa;
  if (b.includes('gorrathul')) return SFX_BOSS_ROARS.gorrathul;
  if (b.includes('vesperion')) return SFX_BOSS_ROARS.vesperion;
  if (b.includes('ashkarath')) return SFX_BOSS_ROARS.ashkarath;
  return null;
}

export function getEndingMusic(ending: string): string {
  const e = ending.toLowerCase();
  if (e === 'b' || e.includes('ember') || e.includes('mantle') || e.includes('sovereign')) {
    return MUSIC_ENDINGS.ember;
  }
  return MUSIC_ENDINGS.crown;
}

export const DIALOGUE_VOICE_CLIPS = [
  'm01_briefing_hale',
  'cs_act1_start_01_narrator',
  'cs_act1_start_02_garrick',
  'cs_act1_start_03_garrick',
] as const;

const MISSION1_VOICE_MATCHERS: readonly {
  clipId: (typeof DIALOGUE_VOICE_CLIPS)[number];
  match: (whoLower: string, text: string, docName: string) => boolean;
}[] = [
  {
    clipId: 'm01_briefing_hale',
    match: (whoLower, text, docName) =>
      docName === 'Blood at the Ford' &&
      whoLower.includes('hale') &&
      (text.startsWith('Blood at the Ford:') || text.includes('frontier riverbanks') || text.includes('gnoll horde')),
  },
  {
    clipId: 'cs_act1_start_01_narrator',
    match: (whoLower, text) => whoLower === 'narrator' && text.includes('Cold drizzle turns'),
  },
  {
    clipId: 'cs_act1_start_02_garrick',
    match: (whoLower, text) => whoLower.includes('garrick') && text.includes('Three patrols overdue'),
  },
  {
    clipId: 'cs_act1_start_03_garrick',
    match: (whoLower, text) => whoLower.includes('garrick') && text.includes('Check your cinch-straps'),
  },
];

/** Resolves Mission 1 / Act 1 neural human voiceover clip ID (`public/audio/voices/<id>.m4a`), or null. */
export function resolveDialogueVoiceClip(who: string, text: string, docName = ''): string | null {
  const whoLower = who.trim().toLowerCase();
  for (const entry of MISSION1_VOICE_MATCHERS) {
    if (entry.match(whoLower, text, docName)) return entry.clipId;
  }
  return null;
}
