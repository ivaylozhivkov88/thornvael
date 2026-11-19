import {
  type DeathMessageEntry,
  type JsonFetcher,
  type LoadingTipEntry,
  getRandomDeathMessage,
  getRandomTip,
  loadDeathMessages,
  loadLoadingTips,
} from './data/text/index';

/** First-time contextual tips: each tip shows once per device. Storage is a convenience; failures just mean tips may repeat. */
export type TipId = 'lowHp' | 'firstLoot' | 'firstSpell';

const KEY = 'thornvael.tips';

export class Tips {
  private readonly seen: Set<string>;
  constructor(private readonly store: Pick<Storage, 'getItem' | 'setItem'> | null, seen?: string[]) {
    let list: string[] = seen ?? [];
    if (!seen && store) {
      try {
        const raw = JSON.parse(store.getItem(KEY) ?? '[]') as unknown;
        if (Array.isArray(raw)) list = raw.filter((x): x is string => typeof x === 'string');
      } catch { /* ignore */ }
    }
    this.seen = new Set(list);
  }
  /** True the first time `id` is asked for (then remembers it). */
  once(id: TipId): boolean {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    try { this.store?.setItem(KEY, JSON.stringify([...this.seen])); } catch { /* ignore */ }
    return true;
  }
}

/** Low HP threshold (percent) for the potion tip. */
export const LOW_HP_TIP = 35;

/** Synchronous bundled fallback of all 50 curated loading-screen tips (`public/data/text/loading-tips-50.json`). */
export const BUNDLED_LOADING_TIPS: readonly LoadingTipEntry[] = [
  { key: 'tip.01', text: 'Drag a selection box to command your entire squad, or assign numbered control groups to split melee frontliners from casters.' },
  { key: 'tip.02', text: 'Focus enemy shamans and weavers first; their firebolts and curses shred unwarded armor faster than pack beasts.' },
  { key: 'tip.03', text: "Keep mercenaries behind your hero's shield line when entering narrow bridges or ossuary choke points." },
  { key: 'tip.04', text: 'Hold position orders prevent archers and mages from chasing fleeing raiders into unlit ambushes.' },
  { key: 'tip.05', text: 'Every spell draws on telluric pressure\u2014watch your mana orb before committing to a prolonged engagement.' },
  { key: 'tip.06', text: 'Drink healing draughts before your health drops below a third; burst damage from elite packs leaves little margin.' },
  { key: 'tip.07', text: 'Compare newly looted gear against equipped pieces before selling\u2014even common upgrades with higher armor save lives.' },
  { key: 'tip.08', text: 'Salvage unwanted magic and rare gear at town smithies to stockpile essences for tempering and affix rerolls.' },
  { key: 'tip.09', text: 'Equipping multiple pieces of a named regimental set unlocks passive bonuses that scale through the late campaign.' },
  { key: 'tip.10', text: 'Socketed runes and quartz crystals turn ordinary weapons into reliable counters against elemental elites.' },
  { key: 'tip.11', text: 'Check the tavern in every hub; mercenaries carry their own gear and can be revived for silver if they fall.' },
  { key: 'tip.12', text: 'Tavern rumors shift as you advance across the four provinces\u2014listen closely for warnings on upcoming bosses.' },
  { key: 'tip.13', text: "Morvessa's silk-brood thrives in tight corridors; lure hatchlings into open ground before using area spells." },
  { key: 'tip.14', text: "Gorrathul's freeze aura slows swing speed and march pace\u2014rely on ranged bolts and fire magic along the causeways." },
  { key: 'tip.15', text: 'Spread your company wide when facing Vesperion; his ball lightning arcs cleanly through bunched formations.' },
  { key: 'tip.16', text: "On the Obsidian Dais, watch Ashkarath's furnace vents and reposition before his fire ring closes." },
  { key: 'tip.17', text: 'Unlocking waypoints along the road lets you fall back to town for repairs and potions without losing map progress.' },
  { key: 'tip.18', text: 'Field shrines grant temporary surges of haste, fortune, or ward power\u2014save nearby ones until a tough fight begins.' },
  { key: 'tip.19', text: 'Side crypts and undervaults hold denser chests and elite packs than the main highway, rewarding bold detours.' },
  { key: 'tip.20', text: 'Frost spells slow charging boars, sand raiders, and cinderhorns, buying precious seconds for archers to fire.' },
  { key: 'tip.21', text: 'Fire magic burns through bitumen-wrapped crypt embalmers and fungal spore matrons with heightened efficiency.' },
  { key: 'tip.22', text: 'Lightning arcs crack mineral seams on basalt brutes, wardstone golems, and water-soaked coastal crabs.' },
  { key: 'tip.23', text: 'Keep a few spare silver groats in reserve\u2014smithing failures and emergency mercenary revivals drain purses quickly.' },
  { key: 'tip.24', text: 'Skirmish maps let you test any saved commander against randomized terrain and enemy rosters without risking campaign state.' },
  { key: 'tip.25', text: 'Export your save file from the roster screen regularly so browser storage resets never erase a veteran hero.' },
  { key: 'tip.26', text: 'On touch devices, tap and hold to issue right-click move or attack orders, and pinch with two fingers to zoom.' },
  { key: 'tip.27', text: 'High ground and bridge heads funnel melee swarms, letting a single armored vanguard hold off triple their number.' },
  { key: 'tip.28', text: 'Do not let dune scarabs die in melee range if your squad is low on health; their cracked shells vent static.' },
  { key: 'tip.29', text: 'Third-Dynasty Probate Debt Law binds indebted skeletons to their posts until the controlling crypt embalmer falls.' },
  { key: 'tip.30', text: 'The twelve Quartz Wardstones of Redmarsh pin alkali dust storms down; repairing them clears visibility and eases travel.' },
  { key: 'tip.31', text: 'In Oakhaven Harbor, whale-oil magazines fuel both lighthouse prisms and siege culverins\u2014guard supply depots carefully.' },
  { key: 'tip.32', text: 'Star-iron must be quenched within four heartbeats in caldera brine; forged relics carry unmatched heat resistance.' },
  { key: 'tip.33', text: 'Respeccing skill points at town costs silver, allowing you to pivot from crowd-control to single-target boss hunting.' },
  { key: 'tip.34', text: 'Elite monsters carry colored auras and special affixes\u2014hover or inspect their nameplates before rushing in.' },
  { key: 'tip.35', text: 'Vampiric elites heal off every landed strike; kite them with ranged units or overwhelm them with burst stuns.' },
  { key: 'tip.36', text: 'A balanced squad pairs one sturdy frontline tank with ranged damage and a caster for elemental coverage.' },
  { key: 'tip.37', text: 'Check the Hall of Relics Codex to track which unique artifacts and monster entries you have yet to uncover.' },
  { key: 'tip.38', text: 'Raising difficulty to Veteran or Doomed sharpens enemy aggression in exchange for richer loot and higher-tier affixes.' },
  { key: 'tip.39', text: 'Never ignore poison ticks in the Weeping Ossuary; green venom stacks steadily even after a spider-brood dies.' },
  { key: 'tip.40', text: 'When fog of war hides a ridge, send a single scout forward rather than marching your wounded company blind.' },
  { key: 'tip.41', text: 'Sound cues warn of off-screen ambushes\u2014listen for gnoll horns, static hums, and heavy stone footsteps.' },
  { key: 'tip.42', text: 'Unidentified crates sold by quartermasters are a gamble, yet occasionally yield rare-tier gear above your current zone.' },
  { key: 'tip.43', text: 'Use attack-move orders when advancing through brushwood so your squad engages ambushers automatically.' },
  { key: 'tip.44', text: 'Mercenary archers excel at picking off glasswings and storm kites that hover beyond melee sword-reach.' },
  { key: 'tip.45', text: 'Every town hub stocks higher-tier gear than the last; revisit Thornwick, Redmarsh, Oakhaven, and Ironcamp as you level.' },
  { key: 'tip.46', text: 'Tempering gear to +5 raises base stats noticeably, though failed strikes risk cracking low-tier scrap.' },
  { key: 'tip.47', text: 'If a boss enrages, prioritize dodging telegraphed ground circles over landing one last greedy swing.' },
  { key: 'tip.48', text: 'In Hardcore mode, death seals the ledger permanently\u2014carry extra healing draughts and never fight cornered.' },
  { key: 'tip.49', text: 'Download chapter packs ahead of travel so the entire campaign runs cleanly offline without mobile data.' },
  { key: 'tip.50', text: 'The Crown of Order binds sovereigns to the Seven Anchor Seals; whatever you choose at the Threshold shapes Thornvael.' },
];

/** Synchronous bundled fallback of all 30 curated death epitaphs (`public/data/text/death-messages-30.json`). */
export const BUNDLED_DEATH_MESSAGES: readonly DeathMessageEntry[] = [
  { key: 'death.01', text: 'Your ledger closes in wet tallow and dried blood; the Salt Tithe claims another unpaid name.' },
  { key: 'death.02', text: 'Cold iron slips from numb fingers while crows gather above the silent tollhouse.' },
  { key: 'death.03', text: 'No lantern answers from the river ford. Only silt and drifting ash mark where the company stood.' },
  { key: 'death.04', text: "Under Third-Dynasty Probate Law, a fallen debtor's ribs belong to the next bailiff who passes." },
  { key: 'death.05', text: 'The wardstone hum fades in your ears, replaced by the slow drip of groundwater on rusted mail.' },
  { key: 'death.06', text: 'Shaved silver groats spill across the mud\u2014worthless now to the hand that counted them.' },
  { key: 'death.07', text: 'Your bowstring snaps in the sleet, and the treeline closes around the last standing banner.' },
  { key: 'death.08', text: 'The telluric valve ruptures without a ground; ozone and cinder swallow the final invocation.' },
  { key: 'death.09', text: 'A cracked helmet rolls into the drainage ditch, leaving the Alder Bridge unguarded until dawn.' },
  { key: 'death.10', text: 'No quartermaster will tally this loss; the Border Mint burned cleaner records than your bones.' },
  { key: 'death.11', text: 'Alkali dust fills your visor as the desert wind erases every bootprint behind the caravan.' },
  { key: 'death.12', text: "Ironheart's sluice-gates stay bolted shut while your company bleeds out onto dry limestone." },
  { key: 'death.13', text: 'Whale-oil slicks catch the last spark, turning the harbor stones into a smoking pyre.' },
  { key: 'death.14', text: 'The tide rises through the Sunken Citadel, sealing helm and cuirass beneath cold black brine.' },
  { key: 'death.15', text: 'Your grounding rod snaps under the surge, and the storm leaves nothing but vitrified glass.' },
  { key: 'death.16', text: 'Caldera ash settles thick over fallen shields, burying steel and oath alike before nightfall.' },
  { key: 'death.17', text: 'Even star-iron bends when the hammer falls too late; the Obsidian Dais claims its toll.' },
  { key: 'death.18', text: 'The Anchor Seals groan deeper beneath the sea, indifferent to one more broken vanguard.' },
  { key: 'death.19', text: 'A cold draft extinguishes the camp brazier. Tomorrow another sellsword will take your contract.' },
  { key: 'death.20', text: 'Bitumen and copper wire await the unclaimed dead\u2014pray the Scriptorium never finds your corpse.' },
  { key: 'death.21', text: 'Your last healing phial shatters on stone; the red stain dries faster than winter rain.' },
  { key: 'death.22', text: 'None of the Twelve walked out of that gorge. Only silence returns to the watch-post.' },
  { key: 'death.23', text: 'The road to Ironcamp is paved with better captains than you\u2014and none of them turned back either.' },
  { key: 'death.24', text: 'Venom turns the blood to marsh-silt before a single prayer can reach the dry air.' },
  { key: 'death.25', text: 'Your name is struck from the muster roll with a blunt thumb of charcoal.' },
  { key: 'death.26', text: 'Steel rings once against basalt, then only the wind through empty ribcages remains.' },
  { key: 'death.27', text: 'The fog drinks the torchlight whole, leaving the frontier one company poorer.' },
  { key: 'death.28', text: 'No bell tolls in Thornwick for mercenaries who die beyond the outer palisade.' },
  { key: 'death.29', text: 'Your shield-arm drops; the breach widens; the chronicle ends mid-sentence.' },
  { key: 'death.30', text: "Ashkarath's furnace does not mourn its fuel. Rise again, if any silver remains to buy steel." },
];

let activeLoadingTips: readonly LoadingTipEntry[] = BUNDLED_LOADING_TIPS;
let activeDeathMessages: readonly DeathMessageEntry[] = BUNDLED_DEATH_MESSAGES;

/**
 * Hydrate curated loading tips and death epitaphs from runtime JSON packs (`public/data/text/*.json`),
 * preserving synchronous bundled fallbacks if offline or unavailable.
 */
export async function hydrateCuratedTips(
  baseUrl?: string,
  fetcher?: JsonFetcher,
): Promise<{ tipsCount: number; deathsCount: number }> {
  const [tipsResult, deathsResult] = await Promise.allSettled([
    loadLoadingTips(baseUrl, fetcher),
    loadDeathMessages(baseUrl, fetcher),
  ]);
  if (
    tipsResult.status === 'fulfilled' &&
    Array.isArray(tipsResult.value?.entries) &&
    tipsResult.value.entries.length > 0
  ) {
    activeLoadingTips = tipsResult.value.entries;
  }
  if (
    deathsResult.status === 'fulfilled' &&
    Array.isArray(deathsResult.value?.entries) &&
    deathsResult.value.entries.length > 0
  ) {
    activeDeathMessages = deathsResult.value.entries;
  }
  return { tipsCount: activeLoadingTips.length, deathsCount: activeDeathMessages.length };
}

/** Reset active tips and death epitaphs back to the synchronous bundled defaults. */
export function resetCuratedTipsCache(): void {
  activeLoadingTips = BUNDLED_LOADING_TIPS;
  activeDeathMessages = BUNDLED_DEATH_MESSAGES;
}

/** Return all active curated loading-screen tips. */
export function getAllLoadingTips(): readonly LoadingTipEntry[] {
  return activeLoadingTips;
}

/** Return all active curated death-screen epitaphs. */
export function getAllDeathMessages(): readonly DeathMessageEntry[] {
  return activeDeathMessages;
}

/** Look up a curated loading tip by key (e.g. 'tip.01'). */
export function getLoadingTipByKey(key: string): LoadingTipEntry | undefined {
  return activeLoadingTips.find((entry) => entry.key === key);
}

/** Look up a curated death epitaph by key (e.g. 'death.01'). */
export function getDeathMessageByKey(key: string): DeathMessageEntry | undefined {
  return activeDeathMessages.find((entry) => entry.key === key);
}

/** Pick a curated loading-screen tip entry synchronously. */
export function getLoadingTipEntry(rng: () => number = Math.random): LoadingTipEntry | undefined {
  return getRandomTip(activeLoadingTips, rng);
}

/** Pick a curated loading-screen tip string synchronously for loading overlays or banners. */
export function getLoadingTip(rng: () => number = Math.random): string {
  return getLoadingTipEntry(rng)?.text ?? '';
}

/** Pick a curated death-screen epitaph entry synchronously. */
export function getDeathMessageEntry(rng: () => number = Math.random): DeathMessageEntry | undefined {
  return getRandomDeathMessage(activeDeathMessages, rng);
}

/** Pick a curated death-screen epitaph string synchronously for defeat views. */
export function getDeathMessage(rng: () => number = Math.random): string {
  return getDeathMessageEntry(rng)?.text ?? '';
}

/** Compose a defeat banner payload pairing a curated epitaph with a tactical survival tip. */
export function getDefeatFlavor(rng: () => number = Math.random): {
  deathMessage: string;
  loadingTip: string;
  formatted: string;
} {
  const deathMessage = getDeathMessage(rng);
  const loadingTip = getLoadingTip(rng);
  const formatted = [deathMessage, loadingTip ? `Tip: ${loadingTip}` : ''].filter(Boolean).join('\n');
  return { deathMessage, loadingTip, formatted };
}
