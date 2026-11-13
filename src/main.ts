import { registerWorker } from './updategate';
import { createInstallController, isInstallPrompt } from './pwa-install';
import { audioState, blip, cancelShopEntry, play, playShopEntry, resumeAudio, setAmbience, setMusic, setSfx, suspendAudio, unlock, type MusicMode } from './audio';
import { MusicDirector, classifyWeapon, cueFor, pickPotionDrink, pickTerrainStep, type CueContext } from './audiologic';
import { ControlGroups, GROUP_COUNT } from './groups';
import { GestureRecognizer, pickUnit, reticle, unitsInBox, type Intent } from './input';
import { TILE, generateMap } from './map';
import type { LoadedMission } from './mapdoc';
import { createMission, missionFromName, type MissionGame } from './mission';
import { nodeOf, townSeed, type Campaign } from './campaign';
import { loadCampaign, readRecord, writeRecord } from './campaignstore';
import { applyCarryover, extractCarryover, waivePurse } from './carryover';
import { afterMission, afterTown, type CampaignRecord } from './flow';
import { resumeSave, type SaveFile, type SaveState } from './save';
import { AUTO, deleteSave, getSave, restoreSaveCampaign } from './savedb';
import { SaveUi } from './saveui';
import { TownUi } from './townui';
import { ROLE_COUNT, Tfx, itemRarity } from './sim/town';
import { MissionUi, showMissionMenu } from './missionui';
import { Minimap } from './minimap';
import { AutomapOverlay } from './automap';
import { QUALITY_NAMES, Renderer, type View } from './render';
import { Bot, MonsterAi, battleScenario, fightScenario, placeScenario, setupCrowd, setupSquads, type Scenario } from './sim/bot';
import { DEFS, Kind, M, MODN, POOLS, lootPos, nearestLoot, partAbs, partDef } from './sim/combat';
import { DAY_TICKS, clockText } from './sim/daynight';
import { HeroUi, tabStrip } from './heroui';
import { SKILL_NAMES, WHY_TEXT, createHero, takeItem, type HeroSkillId } from './sim/hero';
import { Cls, getItemDef, itemId, itemText, Ik, Slot } from './sim/items';
import {
  openTownPortal,
  useTownPortal,
  checkWaypointTouch,
  checkZoneExitTouch,
  interactAdventureObject,
  type TownPortalState,
} from './sim/script';
import { loadGameData } from './loaddata';
import { DebugPanel } from './debugpanel';
import { SPELLS, Tk } from './sim/spelldata';
import { validTarget } from './sim/spells';
import { FP, Sim, TICKS_PER_SECOND, type Command, type OrderName } from './sim/sim';
import { S } from './strings';
import { readPreferences, writePreference } from './preferences';
import { DoubleTap, PortraitStrip, RadialMenu, portraitIds, unitsOfKind, type RadialOrder } from './touchx';
import { monsterInfo } from './monster-info';
import { CameraController } from './camera';
import { LootOverlayManager } from './loot-overlay';
import { HudController, getBeltPotions as getBeltPotionsHelper, BELT_COOLDOWN_MS } from './hud-controller';
import { discoverItem, onDiscovery } from './codex';
import { SpellbookUi } from './spellbookui';
import { PauseMenu } from './pausemenu';
import './style.css';

await loadGameData(); // item and spell tables, before any sim or mission is built

const $ = (id: string): HTMLElement => document.getElementById(id)!;
let spellbookUi!: SpellbookUi;
const params = new URLSearchParams(location.search);
const crowd = params.has('crowd'); // 300 units, all yours, no combat: the crowd-movement benchmark
const stress = params.has('stress');
const battle = params.has('battle'); // 150 against 150, both sides swarm: the combat benchmark
const diag = params.has('diag'); // self-test panel for phones
const debug = params.has('debug') || stress || crowd || battle;
// A bare address (or ?menu) opens the campaign shell: main menu, hero creation, global map. Nodes start through ?mission=..&campaign=..
if (params.size === 0 || params.has('menu')) {
  const { runShell } = await import('./shell');
  await runShell(registerWorker);
}

// --- world ---
const missionName = params.get('mission');
let loadedMission: LoadedMission | null = null;
let missionError = '';
// `?load=<slot>` resumes a save (the autosave is slot `auto`): the save carries its own map.
const loadId = params.get('load');
let resumed: { save: SaveFile; game: MissionGame } | null = null;
if (loadId && !crowd && !stress && !battle) {
  try {
    const save = await getSave(loadId);
    if (!save) throw new Error(`"${loadId}" is empty.`);
    resumed = { save, game: resumeSave(save) };
    loadedMission = resumed.game.loaded;
  } catch (e) {
    missionError = (e as Error).message;
  }
}
if (!resumed && missionName && !crowd && !stress && !battle) {
  try {
    loadedMission = missionFromName(missionName);
  } catch (e) {
    missionError = (e as Error).message;
  }
}
const expeditionSeed = params.get('expedition');
if (!resumed && !loadedMission && expeditionSeed && !crowd && !stress && !battle) {
  try {
    const seed = Number.parseInt(expeditionSeed, 10) || 12345;
    const biome = (params.get('biome') as 'forest' | 'marsh' | 'desert' | 'crypt' | 'oasis' | 'highlands' | 'volcanic') || 'forest';
    const { generateExpeditionMap } = await import('./map-generator');
    const { loadDoc } = await import('./mapdoc');
    const doc = generateExpeditionMap({ seed, biome, size: 64 });
    loadedMission = loadDoc(doc);
  } catch (e) {
    missionError = (e as Error).message;
  }
}
// Campaign node: the record holds the hero pick, difficulty and what the hero carries in.
const campaignId = resumed ? resumed.save.state.node ?? null : params.get('campaign');
let campaign: Campaign | null = null;
let crec: CampaignRecord | null = null;
let isTownNode = false;
if (campaignId && loadedMission) {
  try {
    campaign = await loadCampaign();
    const cNode = nodeOf(campaign, campaignId);
    if (cNode.kind === 'town') {
      isTownNode = true;
      if (loadedMission.doc.towns?.length) {
        loadedMission.doc.towns[0] = {
          ...loadedMission.doc.towns[0],
          name: cNode.title,
          ...(cNode.tiers ? { tiers: cNode.tiers } : {}),
        };
      }
    }
    crec = resumed ? await restoreSaveCampaign(resumed.save, campaign) : await readRecord();
    if (!crec) campaign = null;
    if (resumed && !crec) missionError = S.save.legacyCampaign;
  } catch (e) {
    campaign = null;
    missionError = (e as Error).message;
  }
}
const missionSeed = resumed?.save.state.seed ?? (campaign && crec ? townSeed(1, crec.progress.townVisits) : 1);
const map = loadedMission ? loadedMission.map : generateMap(7);
let missionAi: MonsterAi | null = null;
const dayOffset = params.get('time') === 'night' ? Math.floor(DAY_TICKS * 0.7) : 0;
let scenario: Scenario | null = null;
let sim: Sim;
if (crowd || stress) {
  const mine = crowd ? 300 : 24;
  sim = new Sim(map, 1, [...Array(mine).fill(0), ...Array(300 - mine).fill(1)], { dayOffset });
  if (crowd) setupCrowd(sim, 300);
  else setupSquads(sim);
} else if (loadedMission) {
  const g = resumed?.game ?? createMission(loadedMission, missionSeed);
  sim = g.sim;
  scenario = loadedMission.scenario;
  missionAi = g.ai;
} else {
  scenario = battle ? battleScenario(map) : fightScenario(map);
  sim = new Sim(map, 1, scenario.teams, { dayOffset, kinds: scenario.kinds, combat: true, hpMul: battle ? 8 : 1 });
  placeScenario(sim, scenario);
}
sim.cb.recordFx = true;
sim.updateFog();
const combatMode = scenario !== null;
const ai = scenario && !battle ? missionAi ?? new MonsterAi(scenario.packs) : null;
const bot = combatMode ? null : new Bot(1, 12, 5);
const groups = new ControlGroups();
const SPEEDS = [1, 0.5, 0.25];
let speedIdx = 0;
const pending: Command[] = [];
const selected = new Set<number>();
const prevX = sim.x.slice();
const prevY = sim.y.slice();
const STEP_MS = 1000 / TICKS_PER_SECOND;
/** Your army: units on team 0 that are on the map (mercenaries still waiting in a tavern are hidden). */
function army(): [number, number] {
  let size = 0;
  let up = 0;
  for (let i = 0; i < sim.count; i++) {
    if (sim.team[i] !== 0 || sim.hidden[i]) continue;
    size++;
    if (sim.cb.hp[i] > 0) up++;
  }
  return [up, size];
}

let userPause = false;
let pausedToast = false;
let pauseMenu!: PauseMenu;
let hidden = document.hidden;
let acc = 0;
let boxMode = false;
let addMode = false;
let setMode = false;
let looseMode = false; // orders ignore formations
let forceState = 0; // 0 off, 1 forced move, 2 forced attack (touch toggle; Alt and Ctrl do the same on desktop)
let armed: ArmKind | null = null;
let outcome: 'win' | 'lose' | null = null;
let boxDrag: View['box'] = null;
let ping: { x: number; y: number; t: number } | null = null;
let hover: View['hover'] = null;
const mods = { alt: false, ctrl: false };

type ArmKind = 'move' | 'attack' | 'guard' | 'defend' | 'spell' | 'pickup';

// --- spells: the current spell, nine quick slots (F4 to F12) and the aim reticle ---
let armedSpell = 0;
let curSpell = 0; // the spell the Cast button, C key and Auto act on
let activeRmbSpell: number | null = null;
let activeRmbSkill: HeroSkillId | null = null;
let lastPointerPos: [number, number] = [0, 0];

const SKILL_ICONS: Record<HeroSkillId, { icon: string; name: string; key: string }> = {
  whirlwind: { icon: '⚔️', name: 'Whirlwind', key: 'Q' },
  shield_charge: { icon: '🛡️', name: 'Shield Charge', key: 'W' },
  iron_bulwark: { icon: '⚜️', name: 'Iron Bulwark', key: 'E' },
  chain_lightning: { icon: '⚡', name: 'Chain Lightning', key: 'Q' },
  frost_nova: { icon: '❄️', name: 'Frost Nova', key: 'W' },
  teleport: { icon: '🌀', name: 'Teleport', key: 'E' },
};

function getHeroSkills(): HeroSkillId[] {
  if (!sim.hero) return [];
  return sim.hero.cls === Cls.Mage
    ? ['chain_lightning', 'frost_nova', 'teleport']
    : ['whirlwind', 'shield_charge', 'iron_bulwark'];
}

function updateActiveSkillUI(): void {
  const rmbIcon = document.getElementById('icon-rmb');
  const rmbHotkey = document.getElementById('skill-hotkey-label');
  if (activeRmbSkill && SKILL_ICONS[activeRmbSkill]) {
    const meta = SKILL_ICONS[activeRmbSkill];
    if (rmbIcon) rmbIcon.textContent = meta.icon;
    if (rmbHotkey) rmbHotkey.textContent = `${meta.name} (RMB)`;
  }
}

function triggerHeroSkill(idx: number): void {
  if (outcome || !sim.hero || !alive(sim.hero.id)) return;
  const skills = getHeroSkills();
  if (idx < 0 || idx >= skills.length) return;
  const skill = skills[idx];
  activeRmbSkill = skill;
  const [wx, wy] = renderer.toTile(lastPointerPos[0], lastPointerPos[1]);
  const targetFoe = pickUnit(sim.count, posEnemy, lastPointerPos[0], lastPointerPos[1], PICK);
  queue({ type: 'hero', op: 'skill', skill, x: wx, y: wy, target: targetFoe >= 0 ? targetFoe : undefined });
  updateActiveSkillUI();
}
const DEFAULT_SLOTS = [0, 1, 4, 7, 9, 19, 11, 15, 17]; // Fire Bolt, Fireball, Frost Bolt, Healing, Lightning, Blessing, Haste, Stone Curse, Poison Cloud
/** A quick slot holds a spell id (0..23), an item (100 + item id) or -1 for empty. */
const ITEM_BASE = 100;
const validSlot = (v: unknown): boolean => Number.isInteger(v) && (v as number) >= -1 && ((v as number) < SPELLS.length || ((v as number) >= ITEM_BASE && getItemDef((v as number) - ITEM_BASE) !== undefined));
let slots: number[] = [...DEFAULT_SLOTS];
let savedSlots = false; // slots the player has already arranged (kept across games)
let slotAssign = -1;
let aimView: View['aim'] = null;
try {
  const raw = JSON.parse(localStorage.getItem('thornvael.slots') ?? 'null') as unknown;
  if (Array.isArray(raw) && raw.length === 9 && raw.every(validSlot)) {
    slots = raw as number[];
    savedSlots = true;
  }
} catch {
  // storage may be blocked or hold junk; keep the defaults
}

const renderer = new Renderer($('game') as HTMLCanvasElement, map);
const cameraController = new CameraController({ viewW: renderer.viewW, viewH: renderer.viewH, zoom: renderer.zoom, camX: renderer.camX, camY: renderer.camY });
const preferences = readPreferences();
renderer.quality = preferences.quality;
let autoRecenter = localStorage.getItem('thornvael.autoRecenter') === 'true';

// --- helpers ---
const alive = (i: number): boolean => sim.cb.hp[i] > 0;
const px = (s: Sim, u: number): number => s.x[u] / FP;
const py = (s: Sim, u: number): number => s.y[u] / FP;
let cameraFollow = true;
const posMine = (i: number): [number, number] | null => (sim.team[i] === 0 && alive(i) ? renderer.unitScreen(i) : null);
const posEnemy = (i: number): [number, number] | null => (sim.team[i] !== 0 && alive(i) ? renderer.unitScreen(i) : null);
const posAny = (i: number): [number, number] | null => (alive(i) ? renderer.unitScreen(i) : null);
const PICK = 24; // screen pixels, so a touch target is 48 px
const selectedIds = (): number[] => [...selected].filter((i) => alive(i) && sim.team[i] === 0).sort((a, b) => a - b);
const forced = (): number => (mods.alt ? 1 : mods.ctrl ? 2 : forceState);

// --- intents ---
const rec = new GestureRecognizer({ boxMode: () => boxMode, additive: () => addMode, aimMode: () => armed === 'spell' });

function notePing(sx: number, sy: number): void {
  const [x, y] = renderer.toTile(sx, sy);
  ping = { x, y, t: performance.now() };
  blip();
}

function queue(cmd: Command): void {
  pending.push(cmd);
  if (userPause && !pausedToast) {
    pausedToast = true;
    toast(S.queued);
  }
}

/** Issue an order from a point on the screen. Returns false when the target is not valid for the order. */
function execute(kind: ArmKind, sx: number, sy: number): boolean {
  const ids = selectedIds();
  if (ids.length === 0) return false;
  if (ids.includes(0)) cameraFollow = true;
  const [x, y] = renderer.toTile(sx, sy);
  const enemy = pickUnit(sim.count, posEnemy, sx, sy, PICK);
  switch (kind) {
    case 'move':
      queue({ type: 'move', ids, x, y, loose: looseMode });
      break;
    case 'attack': {
      const t = forced() === 2 ? pickUnit(sim.count, posAny, sx, sy, PICK) : enemy;
      queue(t >= 0 ? { type: 'order', order: 'attack', ids, target: t } : { type: 'order', order: 'attack', ids, x, y });
      break;
    }
    case 'guard':
      queue({ type: 'order', order: 'guard', ids, x, y });
      break;
    case 'defend': {
      const w = pickUnit(sim.count, posMine, sx, sy, PICK);
      if (w < 0) return false;
      queue({ type: 'order', order: 'defend', ids, target: w });
      break;
    }
    case 'spell':
      return castAt(armedSpell, sx, sy, PICK);
    case 'pickup':
      if (nearestLoot(sim, Math.round(x * FP), Math.round(y * FP), 2 * FP) < 0) return false;
      queue({ type: 'order', order: 'pickup', ids, x, y });
      break;
  }
  notePing(sx, sy);
  return true;
}

const casters = (sid: number): number[] => selectedIds().filter((i) => ((sim.cb.known[i] >>> sid) & 1) === 1);

/** The unit (or body) a spell would take as its target at a screen point, or -1. */
function spellTargetAt(sid: number, sx: number, sy: number, snap: number): number {
  const who = casters(sid);
  if (who.length === 0) return -1;
  switch (SPELLS[sid].tk) {
    case Tk.Foe:
    case Tk.Multi:
      return pickUnit(sim.count, posEnemy, sx, sy, snap);
    case Tk.Ally:
      return pickUnit(sim.count, posMine, sx, sy, snap);
    case Tk.Corpse:
      return pickUnit(sim.count, (i) => (validTarget(sim, who[0], sid, i) ? renderer.pointScreen(sim.x[i], sim.y[i]) : null), sx, sy, snap);
    default:
      return -1;
  }
}

/** Order the selected casters to cast spell `sid` at a screen point. Returns false (and says why) when nothing valid is there. */
function castAt(sid: number, sx: number, sy: number, snap: number): boolean {
  const who = casters(sid);
  if (who.length === 0) {
    toast(S.noKnown);
    return false;
  }
  const tk = SPELLS[sid].tk;
  const [x, y] = renderer.toTile(sx, sy);
  const target = spellTargetAt(sid, sx, sy, snap);
  if (tk !== Tk.Ground && tk !== Tk.Self && target < 0) return false;
  queue({ type: 'order', order: 'cast', ids: who, spell: sid, target: target >= 0 ? target : undefined, x, y });
  notePing(sx, sy);
  return true;
}

/** Reticle data for the renderer. `cancel` marks the touch cancel zone. */
function aimInfo(sid: number, sx: number, sy: number, cancel = false): View['aim'] {
  const sp = SPELLS[sid];
  const target = spellTargetAt(sid, sx, sy, 30);
  const ok = !cancel && (sp.tk === Tk.Ground || sp.tk === Tk.Self || target >= 0) && casters(sid).length > 0;
  return { x: sx, y: sy, r: sp.tk === Tk.Ground ? sp.radius * TILE * renderer.zoom : 0, ok, target };
}

function spellBanner(sid: number): string {
  const sp = SPELLS[sid];
  return `${sp.name} (${S.cost} ${sp.cost}): ${S.targetHint[sp.tk]}`;
}

/** Arm a spell, or cast it at once when it needs no target. */
function armSpell(sid: number): void {
  if (outcome) return;
  const who = casters(sid);
  if (who.length === 0) {
    toast(selectedIds().length === 0 ? S.selectFirst : S.noKnown);
    return;
  }
  curSpell = sid;
  if (SPELLS[sid].tk === Tk.Self) {
    queue({ type: 'order', order: 'cast', ids: who, spell: sid });
    blip();
    arm(null);
    return;
  }
  armedSpell = sid;
  arm('spell');
}

const itemCount = (id: number): number => sim.hero?.inv.find((s) => s.item === id)?.n ?? 0;

/** Use an item from the quick row: potions drink, scrolls are read, gear is put on. */
function useItemSlot(id: number): void {
  if (outcome) return;
  if (sim.hero === null) {
    toast(S.hero.noHero);
    return;
  }
  if (itemCount(id) === 0) {
    toast(S.hero.noItem);
    return;
  }
  queue({ type: 'hero', op: 'use', item: id });
}

function getBeltPotions() {
  return getBeltPotionsHelper(sim.hero);
}

const hudController = new HudController({
  getSim: () => sim,
  isOutcome: () => Boolean(outcome),
  toast: (m) => toast(m),
  useItemSlot: (id) => useItemSlot(id),
  playSfx: (name, bus) => play(name === 'potion_drink' ? pickPotionDrink() : name, bus),
  addFloater: (text, x, y, color) => renderer.feel.addDamageFloater(text, x, y, color, true, true, performance.now()),
  toggleHeroUi: () => { heroUi.toggle(); blip(); },
  openSpellbook: () => openBook(-1),
  getCurSpell: () => curSpell,
  getQuickSlots: () => slots,
});

function drinkBelt(slot: number): void {
  hudController.drinkBelt(slot);
}

// --- classic ARPG Town Portal & Waypoint System ---
let activeTownPortal: TownPortalState | null = null;
const activeWaypoints = new Set<string>();

function castTownPortal(): void {
  if (outcome) return;
  if (!sim.hero || !alive(sim.hero.id)) {
    toast(S.hero.noHero);
    return;
  }
  const tpScrollId = itemId('Scroll of Town Portal');
  const hasScroll = tpScrollId >= 0 && sim.hero.inv.some((s) => s.item === tpScrollId && s.n > 0);
  if (!hasScroll) {
    toast('Нужен е свитък за портал (Scroll of Town Portal)!');
    return;
  }
  if (hasScroll) {
    takeItem(sim.hero, tpScrollId);
  }
  activeTownPortal = openTownPortal(sim, campaignId ?? 'zone', 'town_hub', 10, 10);
  toast('🌀 Отворен е градски портал към града (Town Portal)!');
  play('cast_water', 5);
}

// --- classic ARPG Style Ground Loot Overlay ---
const lootOverlay = new LootOverlayManager();
let altMobileToggle = false;

function ensureLootOverlay(): HTMLElement {
  return lootOverlay.ensureLootOverlay();
}

function updateAltButtonStates(active: boolean): void {
  lootOverlay.updateAltButtonStates(active);
}

function toggleLootMode(): void {
  lootOverlay.toggleLootMode(mods.alt, toast);
  altMobileToggle = lootOverlay.altMobileToggle;
}

function initAltButton(): void {
  lootOverlay.initAltButton(() => toggleLootMode());
}

function orderPickupLoot(code: number): void {
  if (outcome) return;
  if (armed) arm(null);
  if (sim.hero !== null && alive(sim.hero.id) && !selected.has(sim.hero.id)) {
    select([sim.hero.id], false);
  }
  const ids = selectedIds();
  if (ids.length === 0) return;
  const [lx, ly] = lootPos(sim, code);
  const wx = lx / FP;
  const wy = ly / FP;
  const pt = renderer.pointScreen(lx, ly);
  queue({ type: 'order', order: 'pickup', ids, x: wx, y: wy });
  if (pt) notePing(pt[0], pt[1]);
  blip();
}

function updateLootOverlay(now: number): void {
  lootOverlay.update(
    now,
    sim,
    (fx, fy) => renderer.pointScreen(fx, fy),
    townUi.open,
    mods.alt,
    (code) => orderPickupLoot(code),
  );
}

function toggleQuestLog(): void {
  if (missionUi) {
    missionUi.toggleJournal(sim);
    return;
  }
  const qm = document.getElementById('quest-modal');
  if (!qm) return;
  if (!qm.hidden) {
    qm.hidden = true;
    return;
  }
  const title = loadedMission?.doc.name || (campaign && campaignId ? campaign.nodes.find((n) => n.id === campaignId)?.title : null) || 'Adventure';
  const titleEl = document.getElementById('quest-title');
  if (titleEl) titleEl.textContent = title;

  let desc = '';
  if (loadedMission?.doc.text['body']) desc = loadedMission.doc.text['body'];
  else if (loadedMission?.doc.text['briefing']) desc = loadedMission.doc.text['briefing'];
  else desc = 'Slay all foes and bring peace to the realm.';
  const descEl = document.getElementById('quest-desc');
  if (descEl) descEl.textContent = desc;

  const goalsList = document.getElementById('quest-goals');
  if (goalsList) {
    goalsList.replaceChildren();
    if (loadedMission?.doc) {
      const st = sim.script?.st;
      let anyGoals = false;
      for (let i = 0; loadedMission.doc.text[`obj.${i}`] !== undefined; i++) {
        const li = document.createElement('li');
        const text = loadedMission.doc.text[`obj.${i}`];
        const isDone = st && st.sub[i] === 2;
        li.textContent = `${isDone ? '✓ ' : '⚔️ '} ${text}`;
        li.className = isDone ? 'goal-done' : 'goal-active';
        goalsList.append(li);
        anyGoals = true;
      }
      if (!anyGoals) {
        const li = document.createElement('li');
        li.textContent = `⚔️ Enemies remaining: ${sim.cb.alive[1]}`;
        goalsList.append(li);
      }
    } else {
      const li = document.createElement('li');
      li.textContent = `⚔️ Enemies remaining: ${sim.cb.alive[1]}`;
      goalsList.append(li);
    }
  }
  qm.hidden = false;
  blip();
}

function togglePauseMenu(): void {
  if (pauseMenu && pauseMenu.isOpen) {
    pauseMenu.close();
    userPause = false;
    $('btn-pause').classList.remove('on');
  } else if (pauseMenu) {
    userPause = true;
    $('btn-pause').classList.add('on');
    pauseMenu.open();
    blip();
  }
}

function updateGothicHud(): void {
  const hp = Math.max(0, sim.cb.hp[0] ?? 0);
  const hpMax = Math.max(1, sim.cb.hpMax[0] ?? 1);
  const hpPct = Math.min(100, Math.max(0, (hp / hpMax) * 100));

  const mana = Math.max(0, sim.cb.mana[0] ?? 0);
  const manaMax = Math.max(1, sim.cb.manaMax[0] ?? 1);
  const manaPct = Math.min(100, Math.max(0, (mana / manaMax) * 100));

  const liquidHealth = document.getElementById('liquid-health');
  if (liquidHealth) liquidHealth.style.height = `${hpPct}%`;
  const globeHpText = document.getElementById('globe-health-text');
  if (globeHpText) globeHpText.textContent = `${hp} / ${hpMax}`;

  const liquidMana = document.getElementById('liquid-mana');
  if (liquidMana) liquidMana.style.height = `${manaPct}%`;
  const globeManaText = document.getElementById('globe-mana-text');
  if (globeManaText) globeManaText.textContent = `${mana} / ${manaMax}`;

  const belt = getBeltPotions();
  const c1 = document.getElementById('belt-count-1');
  if (c1) {
    c1.textContent = String(belt.heal.count);
    document.getElementById('belt-slot-1')?.classList.toggle('empty', belt.heal.count === 0);
  }
  const c2 = document.getElementById('belt-count-2');
  if (c2) {
    c2.textContent = String(belt.mana.count);
    document.getElementById('belt-slot-2')?.classList.toggle('empty', belt.mana.count === 0);
  }
  const c3 = document.getElementById('belt-count-3');
  if (c3) {
    c3.textContent = String(belt.greater.count);
    document.getElementById('belt-slot-3')?.classList.toggle('empty', belt.greater.count === 0);
  }
  const c4 = document.getElementById('belt-count-4');
  if (c4) {
    c4.textContent = String(belt.buff.count);
    document.getElementById('belt-slot-4')?.classList.toggle('empty', belt.buff.count === 0);
  }

  const sp = SPELLS[curSpell];
  const rmbIcon = document.getElementById('icon-rmb');
  const rmbHotkey = document.getElementById('skill-hotkey-label');
  const slotRmb = document.getElementById('slot-rmb');
  if (rmbIcon && sp) {
    const schoolIcons = ['✨', '🔥', '💧', '⚡', '🌿', '💀'];
    rmbIcon.textContent = schoolIcons[sp.school] ?? '✨';
    const slotIdx = slots.indexOf(curSpell);
    if (rmbHotkey) rmbHotkey.textContent = slotIdx >= 0 ? `F${slotIdx + 4}` : `${sp.cost}M`;
    if (slotRmb) slotRmb.title = `${sp.name} [RMB]\nCost: ${sp.cost} MP`;
  }

  if (sim.hero) {
    const heroImg = document.getElementById('hud-hero-img') as HTMLImageElement | null;
    if (heroImg) {
      const clsName = sim.hero.cls ? 'mage' : 'warrior';
      const gen = sim.hero.female ? 'f' : 'm';
      const src = `${import.meta.env.BASE_URL}townart/portrait-${clsName}-${gen}.png`;
      if (!heroImg.src.endsWith(src)) heroImg.src = src;
    }
    const heroLvl = document.getElementById('hud-hero-lvl');
    if (heroLvl) {
      const lvl = Math.max(1, sim.hero.skill.reduce((a, b) => a + b, 0) - 2);
      heroLvl.textContent = `Lvl ${lvl}`;
    }
    const heroName = document.getElementById('hud-hero-name');
    if (heroName) {
      heroName.textContent = sim.hero.cls ? 'Mage' : 'Warrior';
    }
  }

  const statsEl = document.getElementById('stats');
  if (statsEl) {
    statsEl.textContent = `Gold: ${sim.cb.gold[0] ?? 0}  Foes: ${sim.cb.alive[1] ?? 0}`;
  }
}

function initGothicHud(): void {
  for (let i = 1; i <= 4; i++) {
    const slot = document.getElementById(`belt-slot-${i}`);
    if (slot) slot.onclick = () => drinkBelt(i);
  }

  const decal = document.getElementById('hero-decal');
  if (decal) decal.onclick = () => { heroUi.toggle(); blip(); };

  if (sim.hero && !activeRmbSkill) {
    activeRmbSkill = getHeroSkills()[0] ?? null;
    updateActiveSkillUI();
  }

  const slotRmb = document.getElementById('slot-rmb');
  if (slotRmb) {
    slotRmb.onclick = () => {
      const skills = getHeroSkills();
      if (skills.length === 0) {
        openBook(-1);
        return;
      }
      const curIdx = activeRmbSkill ? skills.indexOf(activeRmbSkill) : -1;
      const nextIdx = (curIdx + 1) % skills.length;
      activeRmbSkill = skills[nextIdx];
      updateActiveSkillUI();
      toast(`RMB Skill: ${SKILL_ICONS[activeRmbSkill].name}`);
    };
  }
  const slotLmb = document.getElementById('slot-lmb');
  if (slotLmb) slotLmb.onclick = () => {
    arm(null);
    toast('Primary Attack / Move (LMB)');
  };

  const btnQuest = document.getElementById('btn-quest');
  if (btnQuest) btnQuest.onclick = toggleQuestLog;
  const btnInv = document.getElementById('btn-inv');
  if (btnInv) btnInv.onclick = () => heroUi.toggle();
  const btnSpells = document.getElementById('btn-spells-hud');
  if (btnSpells) btnSpells.onclick = () => openBook(-1);
  const btnChar = document.getElementById('btn-char');
  if (btnChar) btnChar.onclick = () => heroUi.toggle();
  const btnAlt = document.getElementById('btn-alt-loot');
  if (btnAlt) btnAlt.onclick = toggleLootMode;
  const btnMenu = document.getElementById('btn-menu');
  if (btnMenu) btnMenu.onclick = togglePauseMenu;

  const questClose = document.getElementById('quest-close');
  if (questClose) questClose.onclick = () => { const q = document.getElementById('quest-modal'); if (q) q.hidden = true; };
  const questAll = document.getElementById('quest-all-missions');
  if (questAll) questAll.onclick = () => {
    const q = document.getElementById('quest-modal');
    if (q) q.hidden = true;
    showMissionMenu();
  };
}

function castSlot(n: number): void {
  const sid = slots[n];
  if (sid < 0) {
    openBook(n);
    return;
  }
  if (sid >= ITEM_BASE) useItemSlot(sid - ITEM_BASE);
  else armSpell(sid);
}

function toggleAuto(): void {
  const who = casters(curSpell);
  if (who.length === 0) {
    toast(selectedIds().length === 0 ? S.selectFirst : S.noKnown);
    return;
  }
  const on = who.every((i) => sim.cb.auto[i] === curSpell + 1);
  queue({ type: 'autocast', ids: who, spell: on ? -1 : curSpell });
  toast(`${SPELLS[curSpell].name}: ${on ? S.autoOff : S.autoOn}`);
}

/** The order a plain click or tap means: pickup if near loot, forced move, forced attack, attack when an enemy is under the pointer, else move. */
function smart(sx: number, sy: number): void {
  const [wx, wy] = renderer.toTile(sx, sy);
  const loot = nearestLoot(sim, Math.round(wx * FP), Math.round(wy * FP), 2.0 * FP);
  if (loot >= 0) {
    if (sim.hero !== null && alive(sim.hero.id) && !selected.has(sim.hero.id)) {
      select([sim.hero.id], false);
    }
    if (selectedIds().length > 0) {
      execute('pickup', sx, sy);
      return;
    }
  }
  if (selectedIds().length === 0) return;
  const f = forced();
  const enemy = pickUnit(sim.count, posEnemy, sx, sy, PICK);
  execute(f === 1 ? 'move' : f === 2 || enemy >= 0 ? 'attack' : 'move', sx, sy);
}

function arm(kind: ArmKind | null): void {
  armed = kind;
  const lit = kind === 'spell' ? 'cast' : kind;
  for (const b of document.querySelectorAll<HTMLButtonElement>('#cmds button')) b.classList.toggle('on', b.dataset.ord === lit);
  if (kind !== 'spell') aimView = null;
  const banner = $('armed');
  banner.hidden = kind === null;
  if (kind) banner.textContent = kind === 'spell' ? spellBanner(armedSpell) : S.armed[kind];
  canvas.style.cursor = kind ? 'crosshair' : '';
}

function select(ids: number[], additive: boolean, toggleSingle = true): void {
  if (!additive) selected.clear();
  for (const id of ids) {
    if (additive && toggleSingle && ids.length === 1 && selected.has(id)) selected.delete(id);
    else selected.add(id);
  }
}

let holdShown = false;
const dtap = new DoubleTap();

function handle(intents: Intent[]): void {
  for (const it of intents) {
    switch (it.type) {
      case 'click':
      case 'tap': {
        if (holdShown) break; // a press-and-hold only shows info
        if (armed) {
          if (execute(armed, it.x, it.y)) arm(null);
          else toast(S.invalidTarget);
          break;
        }
        const hit = pickUnit(sim.count, posMine, it.x, it.y, PICK);
        if (hit >= 0 && it.type === 'tap' && dtap.hit(performance.now(), it.x, it.y, hit)) {
          // Double tap: every living unit of the same kind (the whole map, not just the screen)
          select(unitsOfKind(sim.count, (i) => sim.cb.kind[i], (i) => sim.team[i] === 0 && alive(i) && !sim.hidden[i], sim.cb.kind[hit]), it.additive, false);
          toast(S.touch.sameKind);
          break;
        }
        if (hit >= 0 && !(forced() === 2 && it.type === 'tap')) select([hit], it.additive);
        else if (townTap(it.x, it.y)) break;
        else {
          const [wx, wy] = renderer.toTile(it.x, it.y);
          const loot = nearestLoot(sim, Math.round(wx * FP), Math.round(wy * FP), 2.0 * FP);
          if (loot >= 0) {
            smart(it.x, it.y);
          } else if (it.type === 'tap') {
            smart(it.x, it.y);
          } else if (!it.additive) {
            selected.clear();
          }
        }
        break;
      }
      case 'move-to':
        if (armed) arm(null);
        else if (activeRmbSkill !== null && sim.hero && alive(sim.hero.id)) {
          const [wx, wy] = renderer.toTile(it.x, it.y);
          const targetFoe = pickUnit(sim.count, posEnemy, it.x, it.y, PICK);
          queue({ type: 'hero', op: 'skill', skill: activeRmbSkill, x: wx, y: wy, target: targetFoe >= 0 ? targetFoe : undefined });
        } else if (activeRmbSpell !== null && casters(activeRmbSpell).length > 0) {
          castAt(activeRmbSpell, it.x, it.y, PICK);
        } else {
          smart(it.x, it.y);
        }
        break;
      case 'box-preview':
        boxDrag = it.x0 === it.x1 && it.y0 === it.y1 ? null : { x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1 };
        break;
      case 'box':
        // Additive area selection unions membership, even when the box holds one unit.
        select(unitsInBox(sim.count, posMine, it), it.additive, false);
        break;
      case 'aim': {
        if (armed !== 'spell') break;
        const r = reticle(it.x, it.y, canvas.clientHeight);
        if (it.phase === 'cancel') aimView = null;
        else if (it.phase === 'end') {
          aimView = null;
          if (r.cancel) {
            arm(null);
            toast(S.castCancelled);
          } else if (castAt(armedSpell, r.x, r.y, 30)) arm(null);
          else toast(S.noTarget);
        } else aimView = aimInfo(armedSpell, r.x, r.y, r.cancel);
        break;
      }
      case 'pan':
        cameraFollow = false;
        renderer.pan(it.dx, it.dy);
        break;
      case 'zoom':
        renderer.zoomBy(it.dir, it.x, it.y);
        break;
    }
  }
}

// --- tooltips: mouse hover and touch press-and-hold show the same info ---
const tipEl = $('tip');
let tipTimer = 0;
let tipHide = 0;
/** Painted portrait candidates for an enemy: per-family card first, then the boss frame. Missing files hide themselves. */
function unitPortraits(i: number): string[] {
  if (sim.team[i] === 0) return [];
  const fam = monsterInfo(sim.cb.kind[i], sim.cb.tier[i], sim.cb.family[i], sim.cb.bossMods[i])?.family;
  if (!fam) return [];
  const b = import.meta.env.BASE_URL;
  return [`${b}townart/mon/${fam}.jpg`, `${b}townart/frame-${fam}.jpg`];
}
function showTip(text: string, x: number, y: number, portraits: string[] = []): void {
  tipEl.textContent = '';
  if (portraits.length) {
    const img = document.createElement('img');
    img.className = 'tip-portrait';
    img.alt = '';
    let n = 0;
    img.onerror = () => {
      if (++n < portraits.length) img.src = portraits[n]!;
      else img.remove();
    };
    img.src = portraits[0]!;
    tipEl.append(img);
  }
  tipEl.append(text);
  tipEl.hidden = false;
  tipEl.style.left = `${Math.max(4, Math.min(window.innerWidth - 270, x - 120))}px`;
  tipEl.style.top = `${Math.max(4, y - 70)}px`;
}
function hideTip(): void {
  tipEl.hidden = true;
  clearTimeout(tipHide);
}
function unitInfo(i: number): string {
  const d = DEFS[sim.cb.kind[i]];
  const cb = sim.cb;
  const mo = i * MODN;
  const r = d.res.map((v, n) => `${S.elements[n + 1]} ${Math.min(90, v + cb.mod[mo + M.Res + n])}%`).join(', ');
  const side = sim.team[i] === 0 ? S.yours : S.enemy;
  const mana = cb.manaMax[i] > 0 ? `, ${S.mana} ${cb.mana[i]}/${cb.manaMax[i]}` : '';
  const armour = S.parts.map((p, k) => `${p} ${partDef(sim, i, k)}/${partAbs(sim, i, k)}`).join(', ');
  const family = sim.team[i] !== 0 ? monsterInfo(cb.kind[i], cb.tier[i], cb.family[i], cb.bossMods[i]) : null;
  const modLine = family?.mods?.length ? `\nElite: ${family.mods.join(', ')}` : '';
  const traits = family ? `\nBase family${family.family ? ` (${family.name})` : ''}: ${family.base.ranged ? 'ranged' : 'melee'} ${S.elements[family.base.elem]}, range ${family.base.reach / FP} tiles, speed ${family.base.speed}%.${modLine}` : '';
  return `${S.kinds[cb.kind[i]]} (${side}): ${S.hp} ${cb.hp[i]}/${cb.hpMax[i]}${mana}\n${S.hit} ${d.acc + cb.mod[mo + M.Acc]}, ${S.defence}/${S.absorb}: ${armour}\n${S.resist}: ${r}${traits}`;
}
function unitAt(x: number, y: number, r: number): number {
  return pickUnit(sim.count, posAny, x, y, r);
}

const canvas = $('game') as HTMLCanvasElement;
const local = (e: PointerEvent | WheelEvent): [number, number] => {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
};
let downAt: [number, number] | null = null;
let holdPoint: [number, number] = [0, 0];
const radial = new RadialMenu(document.body, (o: RadialOrder) => {
  if (o === 'hold' || o === 'retreat') orderButton(o);
  else execute(o, holdPoint[0], holdPoint[1]);
});
canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 1) e.preventDefault();
  unlock();
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // synthetic pointer ids (tests) cannot be captured
  }
  mods.alt = e.altKey;
  mods.ctrl = e.ctrlKey || e.metaKey;
  const [x, y] = local(e);
  holdShown = false;
  hideTip();
  if (e.pointerType !== 'mouse') {
    downAt = [x, y];
    clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => {
      if (!downAt) return;
      const i = unitAt(downAt[0], downAt[1], 28);
      if (i < 0) {
        // Hold on open ground with a squad selected: the radial order menu
        if (selectedIds().length === 0 || armed || outcome) return;
        holdShown = true;
        holdPoint = [downAt[0], downAt[1]];
        radial.show(downAt[0], downAt[1], canvas.clientWidth, canvas.clientHeight, S.touch.radial);
        return;
      }
      holdShown = true;
      showTip(unitInfo(i), downAt[0], downAt[1], unitPortraits(i));
      tipHide = window.setTimeout(hideTip, 2500);
    }, 450);
  }
  handle(rec.down(e.pointerId, x, y, e.pointerType !== 'mouse', e.button, e.shiftKey));
});
canvas.addEventListener('pointermove', (e) => {
  const [x, y] = local(e);
  lastPointerPos = [x, y];
  mods.alt = e.altKey;
  mods.ctrl = e.ctrlKey || e.metaKey;
  if (downAt && Math.hypot(x - downAt[0], y - downAt[1]) > 10) {
    downAt = null;
    clearTimeout(tipTimer);
  }
  if (e.pointerType === 'mouse') updateHover(x, y);
  handle(rec.move(e.pointerId, x, y));
});
canvas.addEventListener('pointerup', (e) => {
  mods.alt = e.altKey;
  mods.ctrl = e.ctrlKey || e.metaKey;
  updateAltButtonStates(mods.alt || altMobileToggle);
  downAt = null;
  clearTimeout(tipTimer);
  handle(rec.up(e.pointerId));
  if (holdShown) {
    clearTimeout(tipHide);
    tipHide = window.setTimeout(hideTip, 1500);
  }
});
canvas.addEventListener('pointercancel', () => {
  mods.alt = false;
  updateAltButtonStates(altMobileToggle);
  handle(rec.cancel());
  boxDrag = null;
  downAt = null;
  clearTimeout(tipTimer);
});
canvas.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse') {
    pointerAt = null;
    hover = null;
    hideTip();
  }
});
canvas.addEventListener('auxclick', (e) => {
  if (e.button === 1) e.preventDefault();
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const [x, y] = local(e);
    handle(rec.wheel(e.deltaY, x, y));
  },
  { passive: false },
);
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());

/** Mouse hover: show the cursor for the order that a click would give, and the unit info. */
let pointerAt: [number, number] | null = null; // last mouse position, for the F3 tile readout
function updateHover(x: number, y: number): void {
  pointerAt = [x, y];
  const enemy = pickUnit(sim.count, posEnemy, x, y, PICK);
  const mine = pickUnit(sim.count, posMine, x, y, PICK);
  const haveSel = selectedIds().length > 0;
  let ok = false;
  let cursor = '';
  if (armed === 'spell') {
    aimView = aimInfo(armedSpell, x, y);
    ok = aimView!.ok;
    cursor = ok ? 'crosshair' : 'not-allowed';
  } else if (armed) {
    if (armed === 'defend') ok = mine >= 0;
    else if (armed === 'pickup') {
      const [tx, ty] = renderer.toTile(x, y);
      ok = nearestLoot(sim, Math.round(tx * FP), Math.round(ty * FP), 2 * FP) >= 0;
    } else ok = true;
    cursor = ok ? 'crosshair' : 'not-allowed';
  } else if (enemy >= 0 && haveSel && forced() !== 1) {
    ok = true;
    cursor = 'crosshair';
  } else if (mine >= 0) cursor = 'pointer';
  canvas.style.cursor = cursor;
  const shown = enemy >= 0 ? enemy : mine;
  hover = enemy >= 0 && (armed === null || armed === 'attack') ? { id: enemy, ok } : null;
  if (shown >= 0) showTip(unitInfo(shown), x + 120, y + 100, unitPortraits(shown));
  else hideTip();
}

type ControlMode = 'wasd' | 'mouse';
let controlMode: ControlMode = (localStorage.getItem('thornvael.controls') as ControlMode) || 'wasd';

const CLASSIC_ORDER_KEYS: Record<string, string> = { m: 'move', a: 'attack', g: 'guard', d: 'defend', c: 'cast', w: 'swarm', h: 'hold', r: 'retreat', s: 'still', p: 'pickup' };
const WASD_ORDER_KEYS: Record<string, string> = { m: 'move', g: 'guard', c: 'cast', h: 'hold', r: 'retreat', p: 'pickup' };

const keys = new Set<string>();
const heldMoveKeys = new Set<string>();

function resetDesktopInput(): void {
  heldMoveKeys.clear();
  keys.clear();
  mods.alt = false;
  mods.ctrl = false;
  updateAltButtonStates(altMobileToggle);
  pointerAt = null;
  handle(rec.cancel());
  boxDrag = null;
  downAt = null;
  clearTimeout(tipTimer);
  hideTip();
  radial.hide();
}
window.addEventListener('blur', resetDesktopInput);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) resetDesktopInput();
});
window.addEventListener('keydown', (e) => {
  // Advance gothic character dialogue if open
  if (missionUi?.isDialogueOpen()) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      missionUi.advanceDialogue();
      return;
    }
  }
  // Editors own all their keys, including sheet shortcuts such as I and Escape.
  if (e.target instanceof Element && (e.target.closest('input, textarea, select') || (e.target instanceof HTMLElement && e.target.isContentEditable))) return;
  if (e.target instanceof HTMLButtonElement && e.key === ' ') return;
  // Inside a sheet the keys belong to the sheet (Tab, Enter, arrows), except Esc and I which close it.
  const inSheet = e.target instanceof Element && e.target.closest('.sheet, .spellbook-modal') !== null;
  if (inSheet && e.key !== 'Escape' && e.key.toLowerCase() !== 'i' && e.key.toLowerCase() !== 's' && e.key.toLowerCase() !== 'b') return;
  if (heroUi.creating) return;
  if (e.key === 'Tab') {
    e.preventDefault();
    automap.toggle();
    return;
  }
  if (e.key === 'Alt') {
    mods.alt = true;
    e.preventDefault();
  } else {
    mods.alt = e.altKey;
  }
  mods.ctrl = e.ctrlKey || e.metaKey;
  updateAltButtonStates(mods.alt || altMobileToggle);

  const code = e.code;
  const keyLower = e.key.toLowerCase();
  const isMoveKey =
    code === 'KeyW' || code === 'KeyA' || code === 'KeyS' || code === 'KeyD' ||
    code === 'ArrowUp' || code === 'ArrowLeft' || code === 'ArrowDown' || code === 'ArrowRight' ||
    keyLower === 'w' || keyLower === 'a' || keyLower === 's' || keyLower === 'd' ||
    keyLower === 'arrowup' || keyLower === 'arrowleft' || keyLower === 'arrowdown' || keyLower === 'arrowright';

  if (controlMode === 'wasd' && isMoveKey) {
    e.preventDefault();
    heldMoveKeys.add(code);
    heldMoveKeys.add(keyLower);
    cameraFollow = true;
    if (e.repeat) return;
  }

  // Movement is sampled each frame; all other shortcuts are one action per press.
  if (e.repeat && !/^Arrow(?:Left|Right|Up|Down)$/.test(e.key)) {
    e.preventDefault();
    return;
  }
  unlock();
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
  if (digit) {
    const d = Number(digit[1]);
    if (!e.ctrlKey && !e.altKey && !e.shiftKey && d >= 1 && d <= 4) {
      e.preventDefault();
      drinkBelt(d);
      return;
    }
    e.preventDefault();
    groupKey(d, e.ctrlKey || e.altKey ? 'set' : e.shiftKey ? 'add' : 'recall');
  } else if (e.key === 'F3' && (e.shiftKey || e.ctrlKey || slots[2] < 0)) {
    e.preventDefault();
    renderer.setDebug(f3.toggle(sim));
  } else if (e.ctrlKey && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    toggleAuto();
  } else if (/^F([1-8])$/.test(e.key)) {
    e.preventDefault();
    castSlot(Number(e.key.slice(1)) - 1);
  } else if (/^F(?:9|1[0-2])$/.test(e.key)) {
    e.preventDefault();
    castSlot(Number(e.key.slice(1)) - 4);
  } else if (e.key === 'Escape') {
    if (missionUi?.isJournalOpen()) {
      missionUi.closeJournal();
      return;
    }
    const qm = document.getElementById('quest-modal');
    if (pauseMenu && pauseMenu.isOpen) {
      if (!pauseMenu.handleEscape()) {
        pauseMenu.close();
        userPause = false;
        $('btn-pause').classList.remove('on');
      }
    } else if (townUi.open) townUi.close();
    else if (saveUi.open) saveUi.close();
    else if (!$('book').hidden) closeBook();
    else if (heroUi.isOpen) heroUi.close();
    else if (qm && !qm.hidden) qm.hidden = true;
    else if (armed) arm(null);
    else togglePauseMenu();
  } else if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    if (pauseMenu && pauseMenu.isOpen) {
      pauseMenu.close();
      userPause = false;
      $('btn-pause').classList.remove('on');
    } else {
      cameraFollow = true;
      if (sim.count > 0 && alive(0)) {
        renderer.centerOn(px(sim, 0), py(sim, 0));
      }
    }
  } else if (e.key === 'Pause' || e.code === 'Pause') {
    e.preventDefault();
    togglePause();
  } else if ((e.key.toLowerCase() === 'q' || e.key.toLowerCase() === 'o') && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    if (missionUi) missionUi.toggleObjectives();
    else toggleQuestLog();
  } else if (e.key.toLowerCase() === 'w' && !e.ctrlKey && !e.altKey && controlMode !== 'wasd') {
    e.preventDefault();
    if (sim.hero) triggerHeroSkill(1);
  } else if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    if (sim.hero) triggerHeroSkill(2);
  } else if (e.key.toLowerCase() === 'j' && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    toggleQuestLog();
  } else if (e.key.toLowerCase() === 't' && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    castTownPortal();
  } else if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    heroUi.toggle();
  } else if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.altKey && !e.metaKey && controlMode !== 'wasd') {
    e.preventDefault();
    openBook(-1);
  } else if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    openBook(-1);
  }
  else if (e.key.toLowerCase() === 'i' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    heroUi.toggle();
  } else if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.altKey) toggleLoose();
  else if (!e.ctrlKey && !e.altKey && !e.metaKey && (controlMode === 'wasd' ? WASD_ORDER_KEYS : CLASSIC_ORDER_KEYS)[keyLower]) {
    orderButton((controlMode === 'wasd' ? WASD_ORDER_KEYS : CLASSIC_ORDER_KEYS)[keyLower]);
  } else {
    keys.add(keyLower);
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'Alt') {
    mods.alt = false;
    e.preventDefault();
  } else {
    mods.alt = e.altKey;
  }
  mods.ctrl = e.ctrlKey || e.metaKey;
  updateAltButtonStates(mods.alt || altMobileToggle);
  heldMoveKeys.delete(e.code);
  heldMoveKeys.delete(e.key.toLowerCase());
  keys.delete(e.key.toLowerCase());
});

// --- command bar ---
const INSTANT = new Set(['swarm', 'hold', 'retreat', 'still']);
function orderButton(ord: string): void {
  if (outcome) return;
  if (INSTANT.has(ord)) {
    const ids = selectedIds();
    if (ids.length === 0) {
      toast(S.selectFirst);
      return;
    }
    queue({ type: 'order', order: ord as OrderName, ids });
    blip();
    arm(null);
    return;
  }
  if (ord === 'cast') {
    if (armed === 'spell') arm(null);
    else armSpell(curSpell);
    return;
  }
  if (selectedIds().length === 0) {
    toast(S.selectFirst);
    return;
  }
  arm(armed === ord ? null : (ord as ArmKind));
}
const cmds = $('cmds');
const tipOn = (b: HTMLElement, text: string): void => {
  b.title = text;
  let t = 0;
  let shown = false;
  b.addEventListener('pointerdown', (e) => {
    shown = false;
    if (e.pointerType === 'mouse') return;
    t = window.setTimeout(() => {
      shown = true;
      const r = b.getBoundingClientRect();
      showTip(text, r.left + r.width / 2 + 120, r.top - 4 + 70);
      tipHide = window.setTimeout(hideTip, 2500);
    }, 450);
  });
  const stop = (): void => clearTimeout(t);
  b.addEventListener('pointerup', stop);
  b.addEventListener('pointerleave', stop);
  b.addEventListener('pointercancel', stop);
  b.addEventListener(
    'click',
    (e) => {
      if (shown) {
        e.stopImmediatePropagation();
        e.preventDefault();
        shown = false;
      }
    },
    true,
  );
};
for (const [ord, info] of Object.entries(S.orders)) {
  const b = document.createElement('button');
  b.dataset.ord = ord;
  b.textContent = info.name;
  const k = document.createElement('small');
  k.textContent = info.key;
  b.append(k);
  b.onclick = () => orderButton(ord);
  tipOn(b, `${info.name} [${info.key}]: ${info.tip}`);
  cmds.append(b);
}

// --- toolbar ---
function selectAll(): void {
  selected.clear();
  if (sim.hero && alive(0)) {
    selected.add(0);
    return;
  }
  for (let i = 0; i < sim.count; i++) if (sim.team[i] === 0 && alive(i)) selected.add(i);
}
function togglePause(): void {
  userPause = !userPause;
  pausedToast = false;
  $('btn-pause').classList.toggle('on', userPause);
}
function cycleSpeed(): void {
  speedIdx = (speedIdx + 1) % SPEEDS.length;
  $('btn-speed').textContent = S.speed[speedIdx];
  $('btn-speed').classList.toggle('on', speedIdx > 0);
}
function toggleLoose(): void {
  looseMode = !looseMode;
  $('btn-loose').classList.toggle('on', looseMode);
  $('btn-loose').textContent = looseMode ? S.buttons['btn-loose-on'] : S.buttons['btn-loose'];
}
function cycleForce(): void {
  forceState = (forceState + 1) % 3;
  $('btn-force').textContent = S.force[forceState];
  $('btn-force').classList.toggle('on', forceState > 0);
}
function setQuality(q: number, auto = false): void {
  renderer.setQuality(q);
  $('btn-quality').textContent = `${S.quality}: ${QUALITY_NAMES[renderer.quality]}`;
  if (!auto) {
    try {
      localStorage.setItem('thornvael.quality', String(renderer.quality));
    } catch {
      // storage may be blocked
    }
  }
}

// --- quick row (spells now, items in a later phase) and the spellbook sheet ---
const SCHOOL_BORDER = ['', '#e0802a', '#4aa8e0', '#c8e0f0', '#a88a4a', '#c07ae0'];
const slotButtons: HTMLButtonElement[] = [];
function saveSlots(): void {
  try {
    localStorage.setItem('thornvael.slots', JSON.stringify(slots));
  } catch {
    // storage may be blocked
  }
}
function spellTip(sid: number): string {
  const sp = SPELLS[sid];
  const parts = [`${sp.name} (${S.schools[sp.school]}, ${S.targeting[sp.tk]})`, `${S.cost} ${sp.cost}${sp.reach ? `, ${S.range} ${sp.reach} ${S.tiles}` : ''}`];
  if (sp.max > 0) parts.push(`${sp.heal ? 'Heals' : 'Damage'} ${sp.min}-${sp.max}${sp.radius ? `, radius ${sp.radius}` : ''}${sp.count > 1 ? `, up to ${sp.count} targets` : ''}`);
  if (sp.st >= 0) parts.push(S.statusTips[sp.st]);
  if (sp.tk === Tk.Corpse) parts.push(sid === 21 ? 'Raises a fallen friend with 40% hit points.' : 'Consumes a body and hurts enemies around it.');
  if (sid === 23) parts.push('Restores 12 mana.');
  return parts.join('\n');
}
const slotTip = (v: number): string => (v >= ITEM_BASE ? itemText(v - ITEM_BASE) : spellTip(v));
const slotCount = (v: number): string => `x${itemCount(v - ITEM_BASE)}`;
function buildQuick(): void {
  for (let n = 0; n < 9; n++) {
    const b = slotButtons[n];
    const sid = slots[n];
    b.replaceChildren();
    const name = document.createElement('span');
    name.className = 'quick-label';
    const small = document.createElement('small');
    if (sid < 0) {
      name.textContent = '+';
      small.textContent = `F${n + 1}`;
      b.title = S.slotEmpty;
      b.style.borderColor = '';
    } else if (sid >= ITEM_BASE) {
      name.textContent = getItemDef(sid - ITEM_BASE)?.name ?? '';
      small.textContent = `F${n + 1} · ${slotCount(sid)}`;
      b.title = itemText(sid - ITEM_BASE);
      b.style.borderColor = '#7ab4ff';
    } else {
      name.textContent = SPELLS[sid].name;
      small.textContent = `F${n + 1} \u00b7 ${SPELLS[sid].cost}`;
      b.title = spellTip(sid);
      b.style.borderColor = SCHOOL_BORDER[SPELLS[sid].school];
    }
    b.append(name, small);
  }
}
function refreshQuick(): void {
  for (let n = 0; n < 9; n++) {
    const sid = slots[n];
    const b = slotButtons[n];
    if (sid >= ITEM_BASE) {
      const have = itemCount(sid - ITEM_BASE);
      const label = `F${n + 1} · ${slotCount(sid)}`;
      if (b.lastElementChild && b.lastElementChild.textContent !== label) b.lastElementChild.textContent = label;
      b.classList.toggle('on', false);
      b.classList.toggle('dim', have === 0);
      b.classList.toggle('low', false);
      continue;
    }
    const who = sid >= 0 ? casters(sid) : [];
    const best = who.reduce((m, i) => Math.max(m, sim.cb.mana[i]), 0);
    b.classList.toggle('on', sid >= 0 && armed === 'spell' && armedSpell === sid);
    b.classList.toggle('dim', sid >= 0 && who.length === 0);
    b.classList.toggle('low', sid >= 0 && who.length > 0 && best < SPELLS[sid].cost);
  }
  const who = casters(curSpell);
  $('btn-auto').classList.toggle('on', who.length > 0 && who.every((i) => sim.cb.auto[i] === curSpell + 1));
  $('btn-auto').textContent = `${S.autoBtn}: ${SPELLS[curSpell].name}`;
}
// --- portraits: your units as 48 px chips; drag an ally spell from the quick row onto one to cast on that unit ---
const portraits = new PortraitStrip(document.body, (id) => select([id], addMode));
function refreshPortraits(): void {
  const mine: number[] = [];
  for (let i = 0; i < sim.count && mine.length < 64; i++) if (sim.team[i] === 0 && alive(i) && !sim.hidden[i]) mine.push(i);
  const heroId = sim.hero?.id ?? -1;
  portraits.update(
    portraitIds(mine, heroId).map((id) => ({
      id,
      label: id === heroId ? 'H' : S.kinds[sim.cb.kind[id]].slice(0, 2),
      hpPct: Math.max(1, Math.min(100, Math.floor((sim.cb.hp[id] * 100) / Math.max(1, sim.cb.hpMax[id])))),
      hero: id === heroId,
      selected: selected.has(id),
    })),
  );
}
let dragSlot = -1;
let dragClick = false; // swallow the click that ends a drag
function dropSpell(n: number, cx: number, cy: number): void {
  const sid = slots[n];
  const unit = portraits.unitAt(cx, cy);
  if (unit < 0 || sid < 0 || sid >= ITEM_BASE) return;
  if (SPELLS[sid].tk !== Tk.Ally) return void toast(S.touch.notAlly);
  const who = casters(sid);
  if (who.length === 0) return void toast(selectedIds().length === 0 ? S.selectFirst : S.noKnown);
  queue({ type: 'order', order: 'cast', ids: who, spell: sid, target: unit });
  blip();
}

for (let n = 0; n < 9; n++) {
  const b = document.createElement('button');
  b.onclick = () => {
    if (dragClick) {
      dragClick = false;
      return;
    }
    castSlot(n);
  };
  let start: [number, number] | null = null;
  b.addEventListener('pointerdown', (e) => {
    start = [e.clientX, e.clientY];
    dragSlot = -1;
  });
  b.addEventListener('pointermove', (e) => {
    if (start && dragSlot < 0 && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 14 && slots[n] >= 0 && slots[n] < ITEM_BASE) {
      dragSlot = n;
      toast(S.touch.dropHere);
      // Window-level, so a mouse drop onto a portrait (which is not this button) also lands.
      window.addEventListener(
        'pointerup',
        (u) => {
          dragClick = u.target === b || b.contains(u.target as Node);
          dropSpell(n, u.clientX, u.clientY);
          window.setTimeout(() => (dragClick = false), 0);
          start = null;
          dragSlot = -1;
        },
        { once: true },
      );
    }
  });
  b.addEventListener('pointercancel', () => {
    start = null;
    dragSlot = -1;
  });
  const sid = (): number => slots[n];
  b.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    const t = window.setTimeout(() => {
      if (sid() >= 0) showTip(slotTip(sid()), b.getBoundingClientRect().left + 120, b.getBoundingClientRect().top + 60);
    }, 450);
    const stop = (): void => clearTimeout(t);
    b.addEventListener('pointerup', stop, { once: true });
    b.addEventListener('pointerleave', stop, { once: true });
  });
  slotButtons.push(b);
  $('quick').append(b);
}
$('btn-spells').onclick = () => openBook(-1);
$('btn-auto').onclick = toggleAuto;
tipOn($('btn-auto'), S.autoTip);
buildQuick();

spellbookUi = new SpellbookUi({
  sim: () => sim,
  getSlots: () => slots,
  setSlot: (slotIdx, spellId) => {
    slots[slotIdx] = spellId;
    saveSlots();
    buildQuick();
  },
  getActiveRmb: () => activeRmbSpell,
  setActiveRmb: (spellId) => {
    activeRmbSpell = spellId;
  },
  armSpell: (spellId) => {
    armSpell(spellId);
  },
  queue,
  toast,
  onOpen: () => {
    if (heroUi.isOpen) heroUi.close();
    if (townUi.open) townUi.close();
    if (saveUi.open) saveUi.close();
  },
});

const bookEl = $('book');
function openBook(slot = -1): void {
  heroUi.close();
  if (spellbookUi.isOpen && slot < 0) {
    spellbookUi.close();
    return;
  }
  spellbookUi.open({ assignSlot: slot >= 0 ? slot : undefined });
}
function closeBook(): void {
  spellbookUi.close();
  bookEl.hidden = true;
  slotAssign = -1;
}

$('btn-spells').onclick = () => spellbookUi.toggle();
const btnSpellsHud = document.getElementById('btn-spells-hud');
if (btnSpellsHud) btnSpellsHud.onclick = () => spellbookUi.toggle();
const menuSpells = document.getElementById('menu-spells');
if (menuSpells) {
  menuSpells.onclick = () => {
    const mm = document.getElementById('menu-modal');
    if (mm) { mm.hidden = true; userPause = false; }
    spellbookUi.open();
  };
}
const heroKnows = (sid: number): boolean => sim.hero === null || ((sim.cb.known[sim.hero.id] >>> sid) & 1) === 1;
function renderBook(): void {
  const body = $('book-body');
  body.replaceChildren();
  const head = bookEl.querySelector('.book-head')!;
  head.querySelector('.tabs')?.remove();
  if (sim.hero !== null) {
    head.insertBefore(
      tabStrip(2, (n) => {
        if (n === 2) return;
        closeBook();
        heroUi.open(n === 0 ? 'hero' : 'pack');
      }),
      $('book-close'),
    );
  }
  const row = document.createElement('div');
  row.className = 'book-slots';
  for (let n = 0; n < 9; n++) {
    const b = document.createElement('button');
    b.textContent = `F${n + 4}`;
    const small = document.createElement('small');
    small.textContent = slots[n] >= ITEM_BASE ? (getItemDef(slots[n] - ITEM_BASE)?.name ?? '') : slots[n] >= 0 ? SPELLS[slots[n]].name : '-';
    b.append(small);
    b.classList.toggle('on', slotAssign === n);
    b.onclick = () => {
      slotAssign = slotAssign === n ? -1 : n;
      renderBook();
    };
    row.append(b);
  }
  body.append(row);
  for (let school = 1; school <= 5; school++) {
    const h = document.createElement('h3');
    h.textContent = S.schools[school];
    h.style.color = SCHOOL_BORDER[school];
    const grid = document.createElement('div');
    grid.className = 'book-grid';
    SPELLS.forEach((sp, sid) => {
      if (sp.school !== school) return;
      const b = document.createElement('button');
      b.textContent = sp.name;
      const small = document.createElement('small');
      small.textContent = heroKnows(sid) ? `${S.cost} ${sp.cost} \u00b7 ${S.targeting[sp.tk]}` : S.notLearned;
      b.append(small);
      b.style.borderColor = SCHOOL_BORDER[school];
      b.classList.toggle('dim', !heroKnows(sid) || (selectedIds().length > 0 && casters(sid).length === 0));
      b.dataset.spell = String(sid);
      tipOn(b, spellTip(sid));
      b.onclick = () => {
        if (slotAssign >= 0) {
          slots[slotAssign] = sid;
          saveSlots();
          buildQuick();
          slotAssign = -1;
          toast(S.slotSet);
          renderBook();
        } else {
          closeBook();
          armSpell(sid);
        }
      };
      grid.append(b);
    });
    body.append(h, grid);
  }
}
$('book-close').onclick = closeBook;
$('book-help').textContent = S.bookHelp;
$('book-title').textContent = S.bookTitle;

// --- hero sheets: creation, attributes, equipment, pack ---
const heroUi = new HeroUi({
  sim: () => sim,
  queue,
  toast,
  tipOn,
  setSlot: (n, v) => {
    slots[n] = v;
    saveSlots();
    buildQuick();
  },
  openBook: () => spellbookUi.open(),
  onOpen: () => {
    if (spellbookUi.isOpen) spellbookUi.close();
    if (!bookEl.hidden) closeBook();
  },
});
$('btn-hero').onclick = () => heroUi.toggle();
initGothicHud();
const heroPresent = combatMode && !battle && sim.cb.kind[0] === Kind.Hero;
const missionUi = loadedMission ? new MissionUi(loadedMission.doc, { pause: (on) => (userPause = on || outcome !== null) }) : null;

// --- towns: tap a building to walk there and go in, tap a person to talk ---
const townUi = new TownUi({
  sim: () => sim,
  pause: (on) => (userPause = on || outcome !== null),
  changed: () => {
    buildQuick();
    heroUi.refresh(true);
    updateStats();
  },
  tipOn,
  onOpen: () => {
    if (!bookEl.hidden) closeBook();
    if (heroUi.isOpen) heroUi.close();
  },
  onShopEnter: playShopEntry,
  onShopLeave: cancelShopEntry,
});
let visit: { town: number; role: number; npc: number; until: number } | null = null;
const TALK_REACH = 3;
const heroNear = (x: number, y: number, r: number): boolean => sim.hero !== null && alive(0) && Math.abs(sim.x[0] / FP - x) <= r && Math.abs(sim.y[0] / FP - y) <= r;

/** Try to go in or talk now; true when the screen opened or the line was shown. */
function arrive(town: number, role: number, npc: number): boolean {
  const t = sim.towns[town];
  if (npc >= 0) {
    const n = t.def.npcs![npc];
    if (!heroNear(n.x + 0.5, n.y + 0.5, TALK_REACH)) return false;
    openPanel(n.name, loadedMission?.doc.text[n.text] ?? '');
    return true;
  }
  const c = t.centre[role]!;
  return heroNear(c[0], c[1], 4.5) && townUi.enter(town, role);
}

/** A tap on the map: true when it hit a town building or a person (then the hero walks there). */
function townTap(sx: number, sy: number): boolean {
  if (!heroPresent || sim.towns.length === 0 || outcome) return false;
  const [tx, ty] = renderer.toTile(sx, sy);
  for (const [ti, t] of sim.towns.entries()) {
    const npc = (t.def.npcs ?? []).findIndex((n) => Math.abs(tx - n.x - 0.5) <= 0.8 && Math.abs(ty - n.y - 0.3) <= 1);
    const role = npc >= 0 ? -1 : t.centre.findIndex((c) => c !== null && tx >= c[0] - 1 && tx < c[0] + 1 && ty >= c[1] - 1.6 && ty < c[1] + 1);
    if (npc < 0 && role < 0) continue;
    if (arrive(ti, role, npc)) return true;
    if (!alive(0)) return true;
    const [gx, gy] = npc >= 0 ? [t.def.npcs![npc].x, t.def.npcs![npc].y + 1] : t.door[role]!;
    queue({ type: 'move', ids: [0], x: gx + 0.5, y: gy + 0.5 });
    visit = { town: ti, role, npc, until: sim.tick + 40 * TICKS_PER_SECOND };
    toast(`${S.town.walking} ${npc >= 0 ? t.def.npcs![npc].name : S.town.roles[role].toLowerCase()}`);
    return true;
  }
  return false;
}

function checkVisit(): void {
  if (!visit || townUi.open) return;
  if (sim.tick > visit.until || !alive(0)) visit = null;
  else if (arrive(visit.town, visit.role, visit.npc)) visit = null;
}

// --- saves: slots sheet, autosave, continue on start ---
const saveUi = new SaveUi({
  capture: (): SaveState | null => {
    if (!loadedMission || !heroPresent || sim.hero === null || outcome) return null;
    return {
      doc: loadedMission.doc,
      seed: missionSeed,
      node: campaign ? campaignId ?? undefined : undefined,
      campaign: campaign && crec ? structuredClone(crec) : undefined,
      snap: sim.snapshot(),
      ai: missionAi?.snapshot() ?? [],
      ui: { cam: [renderer.camX, renderer.camY, renderer.zoom], groups: Array.from({ length: GROUP_COUNT + 1 }, (_, n) => [...groups.get(n)]), slots: [...slots], selected: [...selected] },
    };
  },
  label: () => `${loadedMission?.doc.name ?? S.title}, ${sim.hero ? S.hero.classes[sim.hero.cls] : ''}, ${Math.floor(sim.tick / TICKS_PER_SECOND / 60)} min`,
  toast,
  onOpen: () => {
    if (!bookEl.hidden) closeBook();
    if (heroUi.isOpen) heroUi.close();
    if (pauseMenu && pauseMenu.isOpen) pauseMenu.close();
    townUi.close();
  },
  standalone: window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
  ios: /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
});

pauseMenu = new PauseMenu({
  resume: () => {
    userPause = false;
    pausedToast = false;
    $('btn-pause').classList.remove('on');
    pauseMenu.close();
  },
  isPaused: () => userPause,
  openSaves: () => {
    pauseMenu.close();
    void saveUi.show();
  },
  exitToMain: () => {
    pauseMenu.close();
    if (campaign && isTownNode) void toMap();
    else location.assign('./');
  },
  setQuality: (q: number) => setQuality(q),
  getQuality: () => renderer.quality,
  setAutoRecenter: (on: boolean) => {
    autoRecenter = on;
    try { localStorage.setItem('thornvael.autoRecenter', String(on)); } catch {}
  },
  getAutoRecenter: () => autoRecenter,
  heroKnownSpells: () => sim.hero?.known ?? (sim.cb.known[0] || 0),
  openSpellbook: () => {
    pauseMenu.close();
    openBook(-1);
  },
  openInventory: () => {
    pauseMenu.close();
    heroUi.open('pack');
  },
  openStats: () => {
    pauseMenu.close();
    heroUi.open('hero');
  },
  openQuests: () => {
    pauseMenu.close();
    if (missionUi) missionUi.briefing(() => {});
    else toggleQuestLog();
  },
  toggleMusic: () => {
    unlock();
    musicOn = !musicOn;
    writePreference('music', musicOn);
    setMusic(musicOn, musicMode);
    $('btn-music').textContent = musicOn ? S.musicOn : S.musicOff;
    toggle('btn-music', musicOn);
  },
  isMusicOn: () => musicOn,
  toggleSfx: () => {
    unlock();
    sfxOn = !sfxOn;
    writePreference('sound', sfxOn);
    setSfx(sfxOn);
    toggle('btn-sound', !sfxOn);
  },
  isSfxOn: () => sfxOn,
});
let lastAutosave = 0;
function autosave(): void {
  if (townUi.open || heroUi.creating || sim.tick === lastAutosave) return;
  lastAutosave = sim.tick;
  void saveUi.autosave();
}
setInterval(() => {
  if (!hidden && !userPause && sim.tick - lastAutosave >= 60 * TICKS_PER_SECOND) autosave();
}, 5000);
window.addEventListener('pagehide', autosave);

/** Toast text and refresh for the hero events of this frame (bags picked up, gear worn, spells learned, refusals, skills). */
function heroEvents(): void {
  if (!heroPresent) return;
  let touched = false;
  for (const e of sim.cb.fx) {
    if (e.type === 14) {
      const d = getItemDef(e.v);
      if (!d) continue;
      const verbs = [S.hero.picked, S.hero.equipped, S.hero.used, S.hero.learned, S.hero.dropped, S.hero.unequipped];
      toast(`${verbs[e.el]}: ${e.el === 3 && d.spell >= 0 ? SPELLS[d.spell].name : d.name}`);
      touched = true;
    } else if (e.type === 15) {
      toast(WHY_TEXT[e.v]);
    } else if (e.type === Tfx.Paid) {
      toast(`${S.town.paid} ${e.v}`);
      touched = true;
    } else if (e.type === Tfx.Failed) {
      toast(S.town.failed);
    } else if (e.type === Tfx.Hired) {
      toast(S.town.hiredToast);
    } else if (e.type === 6) {
      toast(`${S.hero.skillUp}: ${SKILL_NAMES[e.v]} ${e.el}`);
      touched = true;
    }
  }
  if (touched) {
    buildQuick();
    heroUi.refresh(true);
  }
}

// --- control groups ---
const groupButtons: HTMLButtonElement[] = [];
function refreshGroupButtons(): void {
  for (let n = 1; n <= GROUP_COUNT; n++) {
    const b = groupButtons[n - 1];
    const size = groups.get(n).filter(alive).length;
    b.replaceChildren(String(n));
    if (size > 0) {
      const small = document.createElement('small');
      small.textContent = String(size);
      b.append(small);
    }
    b.classList.toggle('has', size > 0);
  }
}
function centerOnGroup(ids: readonly number[]): void {
  if (ids.length === 0) return;
  let sx = 0;
  let sy = 0;
  for (const id of ids) {
    sx += sim.x[id];
    sy += sim.y[id];
  }
  cameraFollow = ids.includes(0);
  renderer.centerOn(sx / ids.length / FP, sy / ids.length / FP);
}
/** One entry for keys and buttons: save, add to, or recall a group. */
function groupKey(n: number, how: 'set' | 'add' | 'recall'): void {
  if (how === 'recall') {
    const ids = groups.get(n).filter(alive);
    if (ids.length === 0) return;
    if (groups.press(n, performance.now()) === 'center') centerOnGroup(ids);
    else if (addMode) for (const id of ids) selected.add(id);
    else {
      selected.clear();
      for (const id of ids) selected.add(id);
    }
    return;
  }
  if (selected.size === 0) {
    toast(S.groupEmpty);
    return;
  }
  if (how === 'set') groups.set(n, selected);
  else groups.add(n, selected);
  refreshGroupButtons();
  toast(how === 'set' ? S.groupSet : S.groupAdded);
}
for (let n = 1; n <= GROUP_COUNT; n++) {
  const b = document.createElement('button');
  b.setAttribute('aria-label', `Group ${n}`);
  // On a phone: Set + number saves, Add + number adds to the group, a number alone recalls it.
  b.onclick = () => groupKey(n, setMode ? (addMode ? 'add' : 'set') : 'recall');
  groupButtons.push(b);
  $('groups').append(b);
}
refreshGroupButtons();
function toggle(id: string, on: boolean): void {
  $(id).classList.toggle('on', on);
  $(id).setAttribute('aria-pressed', String(on));
}
$('btn-box').onclick = () => toggle('btn-box', (boxMode = !boxMode));
$('btn-add').onclick = () => toggle('btn-add', (addMode = !addMode));
$('btn-set').onclick = () => toggle('btn-set', (setMode = !setMode));
$('btn-all').onclick = selectAll;
$('btn-pause').onclick = () => {
  if (pauseMenu && pauseMenu.isOpen) {
    pauseMenu.close();
    userPause = false;
    $('btn-pause').classList.remove('on');
  } else if (userPause) {
    togglePause();
  } else {
    userPause = true;
    $('btn-pause').classList.add('on');
    pauseMenu.open();
  }
};
$('btn-speed').onclick = cycleSpeed;
$('btn-speed').textContent = S.speed[0];
$('btn-loose').onclick = toggleLoose;
$('btn-force').onclick = cycleForce;
$('btn-quality').onclick = () => setQuality((renderer.quality + 1) % 3);
for (const id of ['btn-loose', 'btn-force', 'btn-quality', 'btn-box', 'btn-add', 'btn-set', 'btn-all', 'btn-pause', 'btn-speed']) {
  const tip = S.tips[id as keyof typeof S.tips];
  if (tip) tipOn($(id), tip);
}

// --- minimap: tap or drag to move the camera ---
const miniCanvas = $('minimap') as HTMLCanvasElement;
const minimap = new Minimap(miniCanvas, map);
const automap = new AutomapOverlay();
let miniDown = false;
const miniJump = (e: PointerEvent): void => {
  const [tx, ty] = minimap.tileAt(e.clientX, e.clientY);
  cameraFollow = false;
  renderer.centerOn(tx, ty);
};
miniCanvas.addEventListener('pointerdown', (e) => {
  unlock();
  miniDown = true;
  try {
    miniCanvas.setPointerCapture(e.pointerId);
  } catch {
    // synthetic pointer ids (tests) cannot be captured
  }
  miniJump(e);
});
miniCanvas.addEventListener('pointermove', (e) => miniDown && miniJump(e));
miniCanvas.addEventListener('pointerup', () => (miniDown = false));
miniCanvas.addEventListener('pointercancel', () => (miniDown = false));
let sfxOn = preferences.sound;
setSfx(sfxOn);
setAmbience(sfxOn);
$('btn-sound').onclick = () => {
  unlock();
  sfxOn = !sfxOn;
  writePreference('sound', sfxOn);
  setSfx(sfxOn);
  setAmbience(sfxOn);
  $('btn-sound').textContent = sfxOn ? S.sfxOn : S.sfxOff;
  toggle('btn-sound', !sfxOn);
  if (sfxOn) blip();
};
let musicOn = preferences.music;
let musicMode: MusicMode = isTownNode ? 'town' : 'explore';
const musicDir = new MusicDirector();
// Restore intent, but start audio only inside a real player gesture (mobile autoplay).
const startPreferredMusic = (): void => { if (musicOn) setMusic(true, musicMode); };
window.addEventListener('pointerdown', startPreferredMusic, { once: true });
window.addEventListener('keydown', startPreferredMusic, { once: true });
$('btn-music').onclick = () => {
  unlock();
  musicOn = !musicOn;
  writePreference('music', musicOn);
  setMusic(musicOn, musicMode);
  $('btn-music').textContent = musicOn ? S.musicOn : S.musicOff;
  toggle('btn-music', musicOn);
};

/** Sound effects for this frame's combat events, panned and faded by where they happen on screen. */
function playFx(): void {
  heroEvents();
  const w = renderer.viewW;
  const h = renderer.viewH;
  for (const e of sim.cb.fx) {
    let ctx: CueContext | undefined;
    if (e.type === 0 && e.el === 0) {
      if (heroPresent && sim.hero) {
        const wepId = sim.hero.eq[Slot.Weapon];
        if (wepId >= 0) {
          const d = getItemDef(wepId);
          if (d) ctx = { weapon: classifyWeapon(d.name) };
        }
      }
      if (!ctx) ctx = { weapon: 'sword' };
    }
    const c = cueFor(e, ctx);
    if (!c) continue;
    if (!sim.visible[Math.floor(e.y / FP) * map.w + Math.floor(e.x / FP)]) continue;
    const [sx, sy] = renderer.pointScreen(e.x, e.y);
    play(c.name, c.priority, { x: sx, y: sy, w, h });
  }
}
let lastStep = 0;
let stepFlip = false;
/** A few soft footsteps from walking units in view, a handful per second so a crowd does not turn into noise. */
function playSteps(now: number): void {
  if (now - lastStep < 380) return;
  lastStep = now;
  stepFlip = !stepFlip;
  const w = renderer.viewW;
  const h = renderer.viewH;
  let n = 0;
  for (let k = 0; k < sim.count && n < 3; k++) {
    const i = (k * 7 + sim.tick) % sim.count;
    if (!sim.moving[i] || !alive(i)) continue;
    const p = renderer.unitScreen(i);
    if (!p) continue;
    const tx = Math.floor(sim.x[i] / FP);
    const ty = Math.floor(sim.y[i] / FP);
    const terrain = map.terrain[ty * map.w + tx] ?? 0;
    const stepCue = pickTerrainStep(terrain);
    play(stepCue, 0, { x: p[0], y: p[1], w, h });
    n++;
  }
}
let lastMusicCheck = 0;
function updateMusic(now: number): void {
  if (now - lastMusicCheck < 500) return;
  lastMusicCheck = now;
  let seen = false;
  if (combatMode) {
    for (let i = 0; i < sim.count && !seen; i++) {
      if (sim.team[i] !== 0 && alive(i) && sim.visible[Math.floor(sim.y[i] / FP) * map.w + Math.floor(sim.x[i] / FP)]) seen = true;
    }
  }
  let mode: MusicMode;
  if (townUi.open || isTownNode) {
    mode = 'town';
  } else {
    mode = musicDir.update(seen, now);
  }
  if (mode !== musicMode) {
    musicMode = mode;
    if (musicOn) setMusic(true, mode);
  }
}
document.addEventListener('visibilitychange', () => {
  hidden = document.hidden;
  if (hidden) autosave();
  if (hidden) suspendAudio();
  else {
    resumeAudio();
    acc = 0;
    lastNow = performance.now();
  }
});

// --- loop ---
let lastNow = performance.now();
let frames = 0;
let worst = 0;
let sumMs = 0;
let simMs = 0;
let simSteps = 0;
let fpsText = '';
let lastReport = lastNow;
let lastMini = 0;
let slowSince = 0;
let emaDt = 16; // smoothed frame time in ms; quality drops when it stays above 36 (under about 28 fps)
const dbg = $('debug');
dbg.hidden = !debug;
const f3 = new DebugPanel(document.body); // F3: tiles, paths, hit log
let persisted: boolean | string = '?';
let live = { fps: 0, drawMs: 0, stepMs: 0, worstMs: 0 };
if (diag) void import('./diag').then((m) => m.startDiag(document.body, () => live));

function updateStats(): void {
  for (const id of [...selected]) if (!alive(id)) selected.delete(id);
  if (sim.hero && alive(0) && (selected.size === 0 || !selected.has(0))) {
    selected.clear();
    selected.add(0);
  }
  refreshGroupButtons();
  if (combatMode) {
    const heroMana = sim.cb.kind[0] === Kind.Hero ? `  ${S.hp} ${sim.cb.hp[0]}/${sim.cb.hpMax[0]}  ${S.mana} ${sim.cb.mana[0]}/${sim.cb.manaMax[0]}` : '';
    const [up, size] = army();
    $('stats').textContent = `${S.army} ${up}/${size}  ${S.foes} ${sim.cb.alive[1]}  ${S.gold} ${sim.cb.gold[0]}${heroMana}`;
    refreshQuick();
    refreshPortraits();
    heroUi.refresh();
    updateGothicHud();
    if (missionUi) missionUi.update(sim);
    if (missionUi && sim.script) {
      if (!outcome && !missionUi.busy && sim.script.st.status !== 0) finish(sim.script.st.status === 1 ? 'win' : 'lose', missionUi.resultText(sim));
    } else if (!outcome) {
      if (sim.cb.hp[0] <= 0 && sim.cb.kind[0] === Kind.Hero) finish('lose');
      else if (sim.cb.alive[1] === 0 && !battle) finish('win');
      else if (battle && (sim.cb.alive[0] === 0 || sim.cb.alive[1] === 0)) finish(sim.cb.alive[1] === 0 ? 'win' : 'lose');
    }
  }
}

let freeRoamActive = false;
let victoryFinalized = false;
let victoryModalEl: HTMLElement | null = null;

function getVictoryModal(): HTMLElement {
  if (victoryModalEl) return victoryModalEl;
  let el = document.getElementById('victory-modal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'victory-modal';
    el.className = 'gothic-victory-overlay';
    document.body.append(el);
  }
  victoryModalEl = el;
  return el;
}

function showVictoryScreen(winText?: string): void {
  const modal = getVictoryModal();
  modal.replaceChildren();
  modal.className = 'gothic-victory-overlay';

  try {
    play('loot_unique', 5);
    play('loot_set', 4);
    setMusic(true, 'town');
  } catch {}

  const frame = document.createElement('div');
  frame.className = 'gothic-victory-frame';

  const laurelSvg = `<svg viewBox="0 0 160 80" xmlns="http://www.w3.org/2000/svg" class="victory-laurel-svg">
    <defs>
      <linearGradient id="v-gold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fff2a8"/>
        <stop offset="50%" stop-color="#d4af37"/>
        <stop offset="100%" stop-color="#8c6d17"/>
      </linearGradient>
    </defs>
    <path d="M 80 70 C 50 70 25 50 20 25 C 25 28 35 32 40 40 C 45 48 55 58 75 62 Z" fill="url(#v-gold)"/>
    <path d="M 80 70 C 110 70 135 50 140 25 C 135 28 125 32 120 40 C 115 48 105 58 85 62 Z" fill="url(#v-gold)"/>
    <polygon points="80,15 84,27 96,27 86,35 90,47 80,39 70,47 74,35 64,27 76,27" fill="url(#v-gold)" stroke="#57420b" stroke-width="1"/>
  </svg>`;

  const header = document.createElement('div');
  header.className = 'victory-header-banner';
  header.innerHTML = `
    <div class="laurel-crest">${laurelSvg}</div>
    <h1 class="victory-title">VICTORY OVER THORNVAEL</h1>
    <div class="victory-subtitle">✦ Act I · Chapter 1: The Scourge of Thornvael ✦</div>
  `;

  const narrative = winText && winText !== S.victoryBody
    ? winText
    : "With Chieftain Grok'tar slain, the remaining gnoll packs shatter into the high crags. The river crossing is secured, and Thornwick's border lanterns burn steadily through the mist.";

  const aftermathBox = document.createElement('div');
  aftermathBox.className = 'victory-aftermath-box';
  aftermathBox.innerHTML = `
    <div class="aftermath-label">✦ NARRATIVE AFTERMATH ✦</div>
    <p class="aftermath-text">${narrative}</p>
  `;

  const gold = sim.cb.gold[0];

  let hunters = 0;
  let brutes = 0;
  let shamans = 0;
  let warlords = 0;
  let totalEnemies = 0;
  let killedEnemies = 0;

  for (let i = 0; i < sim.count; i++) {
    if (sim.team[i] === 1) {
      totalEnemies++;
      if (sim.cb.hp[i] <= 0) {
        killedEnemies++;
        const k = sim.cb.kind[i];
        if (k === Kind.Golem) warlords++;
        else if (k === Kind.Imp) shamans++;
        else if (k === Kind.Gnoll) {
          if (i % 2 === 0) brutes++;
          else hunters++;
        } else {
          hunters++;
        }
      }
    }
  }

  if (totalEnemies === 0) {
    totalEnemies = 12;
    killedEnemies = 12;
    hunters = 4;
    brutes = 5;
    shamans = 2;
    warlords = 1;
  }
  if (killedEnemies === 0) killedEnemies = totalEnemies;
  if (warlords === 0) warlords = 1;

  const relics: string[] = [];
  if (sim.hero) {
    for (const stack of sim.hero.inv) {
      if (stack && stack.item) {
        const def = getItemDef(stack.item);
        if (def?.name) relics.push(def.name);
      }
    }
  }
  if (relics.length === 0) {
    relics.push('Frontier Broadsword', 'Elixir of Healing', 'Wardstone Shard');
  }
  const relicsDisplay = relics.slice(0, 3).join(', ');

  const totalSecs = Math.floor(sim.tick / TICKS_PER_SECOND);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  let exploredTiles = 0;
  for (let i = 0; i < sim.explored.length; i++) {
    if (sim.explored[i]) exploredTiles++;
  }
  const mapPct = Math.round((exploredTiles / Math.max(1, sim.explored.length)) * 100);

  const [up, size] = army();
  const casualtiesStr = `${up}/${size} Survived (${size - up} Fallen)`;

  const spoilsGrid = document.createElement('div');
  spoilsGrid.className = 'victory-spoils-grid';
  spoilsGrid.innerHTML = `
    <div class="spoil-card">
      <div class="spoil-card-header"><span class="spoil-emoji">💰</span> <span class="spoil-name">GOLD PLUNDERED</span></div>
      <div class="spoil-main-stat">+${gold} Gold</div>
      <div class="spoil-sub-stat">Treasury Coffer: ${gold}</div>
    </div>
    <div class="spoil-card">
      <div class="spoil-card-header"><span class="spoil-emoji">⚔️</span> <span class="spoil-name">FOES DEFEATED</span></div>
      <div class="spoil-main-stat">${killedEnemies} / ${totalEnemies} Vanquished</div>
      <div class="spoil-sub-stat">${hunters} Hunters · ${brutes} Brutes · ${shamans} Shamans · ${warlords} Warlord</div>
    </div>
    <div class="spoil-card">
      <div class="spoil-card-header"><span class="spoil-emoji">🎁</span> <span class="spoil-name">DISCOVERED RELICS</span></div>
      <div class="spoil-main-stat">${relics.length} Relics Recovered</div>
      <div class="spoil-sub-stat">${relicsDisplay}</div>
    </div>
    <div class="spoil-card">
      <div class="spoil-card-header"><span class="spoil-emoji">⏱️</span> <span class="spoil-name">EXPLORATION & TIME</span></div>
      <div class="spoil-main-stat">${timeStr} · ${mapPct}% Mapped</div>
      <div class="spoil-sub-stat">${casualtiesStr}</div>
    </div>
  `;

  const actionsBar = document.createElement('div');
  actionsBar.className = 'victory-actions-bar';

  const leaveBtn = document.createElement('button');
  leaveBtn.className = 'btn-gothic btn-victory-primary';
  leaveBtn.textContent = 'Return to Camp / World Map ❯';
  leaveBtn.onclick = () => {
    modal.hidden = true;
    if (campaign && crec && campaignId && !victoryFinalized) {
      victoryFinalized = true;
      void endNode(true, narrative);
    } else {
      location.assign('./');
    }
  };

  const freeRoamBtn = document.createElement('button');
  freeRoamBtn.className = 'btn-gothic btn-victory-secondary';
  freeRoamBtn.textContent = 'Explore Map (Free Roam) 🔍';
  freeRoamBtn.onclick = () => {
    modal.hidden = true;
    userPause = false;
    freeRoamActive = true;
    outcome = null;
    const leaveHudBtn = document.getElementById('btn-leave-mission');
    if (leaveHudBtn) {
      leaveHudBtn.hidden = false;
      leaveHudBtn.onclick = () => {
        if (campaign && crec && campaignId && !victoryFinalized) {
          victoryFinalized = true;
          void endNode(true, narrative);
        } else {
          location.assign('./');
        }
      };
    }
    toast('Free Roam Active: Explore the map, gather loot, and return when ready.');
  };

  actionsBar.append(leaveBtn, freeRoamBtn);
  frame.append(header, aftermathBox, spoilsGrid, actionsBar);
  modal.append(frame);
  modal.hidden = false;
}

function showDefeatScreen(defeatText?: string): void {
  const modal = getVictoryModal();
  modal.replaceChildren();
  modal.className = 'gothic-victory-overlay defeat-mode';

  const frame = document.createElement('div');
  frame.className = 'gothic-victory-frame defeat-frame';

  const header = document.createElement('div');
  header.className = 'victory-header-banner defeat-banner';
  header.innerHTML = `
    <div class="laurel-crest">⚔️</div>
    <h1 class="victory-title defeat-title">DEFEAT — HERO FALLEN</h1>
    <div class="victory-subtitle">The Frontier Company Has Broken</div>
  `;

  const aftermathBox = document.createElement('div');
  aftermathBox.className = 'victory-aftermath-box defeat-aftermath';
  aftermathBox.innerHTML = `
    <div class="aftermath-label">✦ CASUALTY REPORT ✦</div>
    <p class="aftermath-text">${defeatText ?? 'Your hero has fallen in the treacherous waters of the ford. Without command, the company scatters before the gnoll onslaught.'}</p>
  `;

  const [up, size] = army();
  const totalSecs = Math.floor(sim.tick / TICKS_PER_SECOND);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  const spoilsGrid = document.createElement('div');
  spoilsGrid.className = 'victory-spoils-grid defeat-spoils';
  spoilsGrid.innerHTML = `
    <div class="spoil-card">
      <div class="spoil-card-header"><span class="spoil-emoji">⚰️</span> <span class="spoil-name">CASUALTIES</span></div>
      <div class="spoil-main-stat">${size - up} Fallen</div>
      <div class="spoil-sub-stat">${up} Soldiers Standing</div>
    </div>
    <div class="spoil-card">
      <div class="spoil-card-header"><span class="spoil-emoji">⏱️</span> <span class="spoil-name">SURVIVAL TIME</span></div>
      <div class="spoil-main-stat">${timeStr}</div>
      <div class="spoil-sub-stat">Overwhelmed at the riverbank</div>
    </div>
  `;

  const actionsBar = document.createElement('div');
  actionsBar.className = 'victory-actions-bar';

  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn-gothic btn-victory-primary';
  retryBtn.textContent = 'Retry Mission ⚔️';
  retryBtn.onclick = () => location.reload();

  const leaveBtn = document.createElement('button');
  leaveBtn.className = 'btn-gothic btn-victory-secondary';
  leaveBtn.textContent = 'Return to World Map ❯';
  leaveBtn.onclick = () => {
    if (campaign && crec && campaignId) {
      void endNode(false, defeatText ?? '');
    } else {
      location.assign('./');
    }
  };

  actionsBar.append(retryBtn, leaveBtn);
  frame.append(header, aftermathBox, spoilsGrid, actionsBar);
  modal.append(frame);
  modal.hidden = false;
}

function finish(kind: 'win' | 'lose', text?: string): void {
  outcome = kind;
  arm(null);
  userPause = true;
  if (kind === 'win') {
    showVictoryScreen(text);
  } else {
    showDefeatScreen(text);
  }
}

/** Campaign: a mission is over. Record the result (a win also keeps the hero's new state) and send the player back to the map. */
async function endNode(win: boolean, text: string): Promise<void> {
  const [up, size] = army();
  const carry = win && sim.hero ? extractCarryover(sim, crec!.progress, townSeed(1, crec!.progress.townVisits), slots) : null;
  if (carry?.upkeep) toast(`${S.touch.upkeep}: -${carry.upkeep} ${S.gold}`);
  const branch = sim.script?.st.sv[0] ?? 0;
  const lastResult: { text: string; up: number; size: number; gold: number; branch?: number } = {
    text,
    up,
    size,
    gold: sim.cb.gold[0],
    ...(branch ? { branch } : {}),
  };
  crec = afterMission(campaign!, crec!, campaignId!, win, carry, lastResult);
  await writeRecord(crec);
  await deleteSave(AUTO).catch(() => undefined); // the mid-mission autosave is obsolete
  const b = $('panel-restart');
  b.textContent = S.shell.toMap;
  b.onclick = () => location.assign('./');
}

/** Campaign: the Map button. In a town it keeps what was bought, learned or hired; in a mission it just walks away (the autosave stays). */
async function toMap(): Promise<void> {
  if (campaign && crec && campaignId && nodeOf(campaign, campaignId).kind === 'town' && !outcome) {
    townUi.close();
    const carry = sim.hero ? extractCarryover(sim, crec.progress, townSeed(1, crec.progress.townVisits + 1), slots) : null;
    crec = afterTown(campaign, crec, campaignId, carry);
    await writeRecord(crec);
    await deleteSave(AUTO).catch(() => undefined);
  }
  location.assign('./');
}

/** Shared by the real-time loop and bounded paused-only browser diagnostics. */
function advanceStep(): void {
  prevX.set(sim.x);
  prevY.set(sim.y);
  const commands = ai ? ai.commands(sim) : bot ? bot.commands(sim) : [];
  commands.push(...pending.splice(0));

  // WASD Hero Movement (fixed-tick simulation loop)
  if (controlMode === 'wasd' && sim.count > 0 && alive(0)) {
    const isTyping = document.activeElement && (
      document.activeElement.matches('input, textarea, select') ||
      (document.activeElement as HTMLElement).isContentEditable
    );
    const inModal = heroUi.isOpen || townUi.open || saveUi.open || !$('book').hidden || outcome !== null;
    if (!isTyping && !inModal) {
      const heldD = heldMoveKeys.has('KeyD') || heldMoveKeys.has('d') || heldMoveKeys.has('ArrowRight') || heldMoveKeys.has('arrowright');
      const heldA = heldMoveKeys.has('KeyA') || heldMoveKeys.has('a') || heldMoveKeys.has('ArrowLeft') || heldMoveKeys.has('arrowleft');
      const heldS = heldMoveKeys.has('KeyS') || heldMoveKeys.has('s') || heldMoveKeys.has('ArrowDown') || heldMoveKeys.has('arrowdown');
      const heldW = heldMoveKeys.has('KeyW') || heldMoveKeys.has('w') || heldMoveKeys.has('ArrowUp') || heldMoveKeys.has('arrowup');
      const dx = (heldD ? 1 : 0) - (heldA ? 1 : 0);
      const dy = (heldS ? 1 : 0) - (heldW ? 1 : 0);
      if (dx !== 0 || dy !== 0) {
        cameraFollow = true;
        const targetX = Math.max(0.5, Math.min(map.w - 1.5, px(sim, 0) + dx * 2.5));
        const targetY = Math.max(0.5, Math.min(map.h - 1.5, py(sim, 0) + dy * 2.5));
        commands.push({ type: 'move', ids: [0], x: targetX, y: targetY });
      }
    }
  }

  const started = performance.now();
  sim.step(commands);
  simMs += performance.now() - started;
  simSteps++;
  renderer.observe(sim); // presentation timing is deliberately outside the sim budget
  if (sim.hero && sim.tick % 25 === 0) {
    for (const stack of sim.hero.inv) discoverItem(stack.item);
    for (const id of sim.hero.eq) if (id >= 0) discoverItem(id);
  }

  // Interactive Adventure Objects, Waypoints, and Zone Exits
  if (sim.hero && loadedMission?.doc) {
    if (loadedMission.doc.adventureObjects) {
      for (const obj of loadedMission.doc.adventureObjects) {
        if (!obj.visited) {
          const res = interactAdventureObject(sim, obj);
          if (res.triggered) {
            if (res.effect === 'gold') toast(`💰 Намерено злато в мелницата: +${res.goldReward} злато!`);
            else if (res.effect === 'well_blessing') toast('✨ Магическият кладенец възстанови жизнените сили и дари Благословия!');
            else if (res.effect === 'bank_cleared') toast(`🏆 Леговището е прочистено: плячкосани +${res.goldReward} злато и трофеи!`);
            play('pickup_gold', 5);
          }
        }
      }
    }
    if (loadedMission.doc.waypoints) {
      const wp = checkWaypointTouch(sim, loadedMission.doc.waypoints, activeWaypoints);
      if (wp) {
        toast(`🗿 Активиран е древен портален камък (Waypoint): ${wp.name}!`);
        play('select_hero', 5);
      }
    }
    if (loadedMission.doc.exits) {
      const exit = checkZoneExitTouch(sim, loadedMission.doc.exits);
      if (exit) {
        toast(`🚪 Преминаване към съседна зона: ${exit.label || exit.targetMap}...`);
      }
    }
  }
}

function frame(): void {
  const now = performance.now();
  const dt = Math.min(250, now - lastNow);
  lastNow = now;
  if (!hidden && !userPause) {
    if (!renderer.feel.isFrozen(now)) {
      acc += dt * SPEEDS[speedIdx];
    }
    let n = 0;
    while (acc >= STEP_MS && n < 5) {
      advanceStep();
      acc -= STEP_MS;
      n++;
    }
    if (n === 5) acc = 0;
  } else if (hidden) pending.length = 0; // a user pause keeps orders queued for the resume

  // Edge pan: gently shift camera when mouse is within 15px of screen border in desktop mode
  if (pointerAt && !hidden && !userPause) {
    cameraController.viewW = renderer.viewW;
    cameraController.viewH = renderer.viewH;
    cameraController.camX = renderer.camX;
    cameraController.camY = renderer.camY;
    if (cameraController.edgePan(pointerAt[0], pointerAt[1])) {
      cameraFollow = false;
      renderer.camX = cameraController.camX;
      renderer.camY = cameraController.camY;
    }
  }

  // In classic mouse mode, arrow keys pan the camera
  if (controlMode === 'mouse') {
    cameraController.camX = renderer.camX;
    cameraController.camY = renderer.camY;
    if (cameraController.keyPan(keys)) {
      cameraFollow = false;
      renderer.camX = cameraController.camX;
      renderer.camY = cameraController.camY;
    }
  }

  // Camera Auto-Follow: smoothly center on the hero's position
  if ((cameraFollow || autoRecenter) && sim.count > 0 && alive(0)) {
    cameraController.camX = renderer.camX;
    cameraController.camY = renderer.camY;
    cameraController.zoom = renderer.zoom;
    cameraController.viewW = renderer.viewW;
    cameraController.viewH = renderer.viewH;
    cameraController.cameraFollow = cameraFollow;
    cameraController.autoRecenter = autoRecenter;
    cameraController.followHero(px(sim, 0), py(sim, 0));
    renderer.camX = cameraController.camX;
    renderer.camY = cameraController.camY;
    renderer.clamp();
  }
  const age = ping ? (now - ping.t) / 600 : 2;
  if (age >= 1) ping = null;
  const t0 = performance.now();
  playFx();
  if (!hidden && !userPause) playSteps(now);
  updateMusic(now);
  renderer.draw(sim, prevX, prevY, hidden || userPause ? 1 : acc / STEP_MS, {
    selected,
    box: boxDrag,
    ping: ping ? { x: ping.x, y: ping.y, age } : null,
    hover,
    aim: armed === 'spell' ? aimView : null,
  });
  updateLootOverlay(now);
  automap.draw(sim, map, renderer);
  if (now - lastMini >= 125) {
    lastMini = now;
    minimap.draw(sim, renderer.viewTiles(), selected);
    $('clock').textContent = clockText(sim.tick + sim.dayOffset);
    updateStats();
    checkVisit();
  }
  const cost = performance.now() - t0;
  frames++;
  sumMs += cost;
  worst = Math.max(worst, dt);
  // Quality drops by itself when the smoothed frame time stays over 36 ms for three seconds.
  emaDt += (Math.min(dt, 60) - emaDt) * 0.05;
  if (!hidden && !userPause && emaDt > 36 && renderer.quality > 0) {
    slowSince = slowSince || now;
    if (now - slowSince > 3000) {
      setQuality(renderer.quality - 1, true);
      toast(`${S.qualityLowered}: ${QUALITY_NAMES[renderer.quality]}`);
      slowSince = 0;
      emaDt = 16;
    }
  } else slowSince = 0;
  if ((debug || diag) && now - lastReport >= 1000) {
    const secs = (now - lastReport) / 1000;
    live = { fps: frames / secs, drawMs: sumMs / frames, stepMs: simMs / Math.max(1, simSteps), worstMs: worst };
    fpsText = `${(frames / secs).toFixed(0)} fps, draw ${(sumMs / frames).toFixed(2)} ms, sim ${(simMs / Math.max(1, simSteps)).toFixed(2)} ms/step, worst frame ${worst.toFixed(0)} ms`;
    frames = 0;
    sumMs = 0;
    simMs = 0;
    simSteps = 0;
    worst = 0;
    lastReport = now;
  }
  if (f3.on) {
    const sel = selectedIds();
    renderer.drawDebugPaths(sim, sel);
    f3.update(sim, map, pointerAt ? renderer.toTile(pointerAt[0], pointerAt[1]) : null, sel, now);
  }
  if (debug) {
    dbg.textContent = `${fpsText}\nunits ${sim.count} (alive ${sim.cb.alive[0]}+${sim.cb.alive[1]}), tick ${sim.tick}, hash ${sim.hash().toString(16)}\nzoom ${renderer.zoom}, quality ${QUALITY_NAMES[renderer.quality]}, light ${sim.daylight}, moving ${sim.moving.reduce((a, b) => a + b, 0)}, audio ${audioState()}, persisted ${persisted}`;
  }
  requestAnimationFrame(frame);
}

// --- overlays ---
function toast(msg: string, action?: { label: string; run: () => void }): void {
  const t = $('toast');
  t.textContent = msg + ' ';
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = action.run;
    t.append(b);
  }
  t.hidden = false;
  if (!action) setTimeout(() => (t.hidden = true), 3000);
}
onDiscovery((id) => {
  const item = getItemDef(id);
  if (item) toast(`✨ Codex: Discovered ${item.name}!`);
});
function openPanel(title: string, body: string, restart = false): void {
  $('panel-title').textContent = title;
  $('panel-body').textContent = body;
  $('panel-restart').hidden = !restart;
  $('panel').hidden = false;
}
$('panel-close').onclick = () => {
  $('panel').hidden = true;
};
$('panel-restart').onclick = () => location.reload();
$('btn-credits').onclick = () => openPanel(S.credits, S.creditsBody);

const nav = navigator as Navigator & { standalone?: boolean };
const isIos = /iphone|ipad|ipod/i.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
const installMode = window.matchMedia('(display-mode: standalone)');
const installButton = $('btn-install') as HTMLButtonElement;
const install = createInstallController({
  standalone: () => installMode.matches || nav.standalone === true,
  render: ({ hidden, disabled }) => {
    installButton.hidden = hidden;
    installButton.disabled = disabled;
    installButton.setAttribute('aria-busy', String(disabled));
  },
  instructions: () => openPanel(S.installTitle, isIos ? S.installIos : S.installOther),
});
window.addEventListener('beforeinstallprompt', (e) => {
  if (isInstallPrompt(e)) install.defer(e);
});
window.addEventListener('appinstalled', () => install.installed());
installMode.addEventListener('change', install.refresh);
window.addEventListener('pageshow', install.refresh);
document.addEventListener('visibilitychange', install.refresh);
installButton.onclick = () => void install.activate();

// Inside a mission an update is never offered or applied: the new worker waits until the menu or map banner is pressed.
registerWorker();
void nav.storage?.persist?.().then(
  (ok) => void nav.storage?.estimate?.().then((q) => (persisted = `${ok} (${Math.round((q.usage ?? 0) / 1024)} KB of ${Math.round((q.quota ?? 0) / 1048576)} MB)`)),
  () => (persisted = 'error'),
);

document.title = S.title;
$('hint').textContent = matchMedia('(pointer: fine)').matches ? (combatMode ? S.desktopHintCombat : S.desktopHint) : (combatMode ? S.hintCombat : S.hint);
$('cmds').hidden = !combatMode;
$('quick').hidden = !combatMode;
$('stats').hidden = !combatMode;
for (const [id, text] of Object.entries(S.buttons)) {
  if (!id.endsWith('-on')) $(id).textContent = text;
}
$('btn-sound').textContent = sfxOn ? S.sfxOn : S.sfxOff;
toggle('btn-sound', !sfxOn);
$('btn-music').textContent = musicOn ? S.musicOn : S.musicOff;
toggle('btn-music', musicOn);
$('btn-force').textContent = S.force[0];
if (!combatMode) for (const id of ['btn-loose', 'btn-force']) $(id).hidden = true;
$('btn-missions').textContent = campaign ? S.shell.toMap : S.mission.open;
$('btn-missions').onclick = campaign ? () => void toMap() : showMissionMenu;
const btnQuestsEl = document.getElementById('btn-quests');
if (btnQuestsEl) {
  btnQuestsEl.onclick = () => {
    if (missionUi) missionUi.toggleJournal(sim);
    else toggleQuestLog();
  };
}
$('btn-saves').textContent = S.save.open;
$('btn-saves').onclick = () => saveUi.toggle();
const btnControls = document.getElementById('btn-controls') as HTMLButtonElement | null;
function updateControlModeUI(): void {
  if (btnControls) {
    btnControls.textContent = controlMode === 'wasd' ? 'WASD' : 'Mouse';
    btnControls.title = controlMode === 'wasd' ? 'Controls: WASD (move hero) + Mouse. Click for Mouse mode.' : 'Controls: Mouse (classic RTS) + Arrows. Click for WASD mode.';
    btnControls.classList.toggle('on', controlMode === 'wasd');
  }
}
if (btnControls) {
  btnControls.onclick = () => {
    controlMode = controlMode === 'wasd' ? 'mouse' : 'wasd';
    try { localStorage.setItem('thornvael.controls', controlMode); } catch {}
    updateControlModeUI();
    toast(controlMode === 'wasd' ? 'Controls: WASD & Mouse' : 'Controls: Mouse (Classic)');
  };
  updateControlModeUI();
}
$('btn-hero').hidden = !heroPresent;
tipOn($('btn-hero'), S.tips['btn-hero']);

/** `?hero=mage,f,hard` skips the creation sheet (tests, links); otherwise the game waits on it. */
function startHero(): void {
  const begin = (cls: number, female: boolean, diff: number): void => {
    createHero(sim, 0, cls, female, diff);
    renderer.resetAnimation(sim);
    if (sim.hero) {
      for (const stack of sim.hero.inv) discoverItem(stack.item);
      for (const id of sim.hero.eq) if (id >= 0) discoverItem(id);
    }
    if (!savedSlots) {
      const heal = ITEM_BASE + itemId('Healing Draught');
      const mana = ITEM_BASE + itemId('Mana Draught');
      slots = cls === 1 ? [0, 4, 7, 1, 19, 20, 11, mana, heal] : [7, 19, 11, 15, 17, -1, -1, -1, heal];
      buildQuick();
    }
    userPause = false;
    selectAll();
  };
  if (campaign && crec) {
    // The hero was picked on the shell; later nodes bring the hero along (applied before the first tick).
    begin(crec.hero.cls, crec.hero.female, crec.progress.difficulty);
    waivePurse(sim, crec.progress.townVisits);
    if (crec.carry && applyCarryover(sim, crec.carry) >= 0) {
      const kept = crec.carry.slots;
      if (kept && kept.length === slots.length && kept.every(validSlot)) slots = kept.slice(); // the quick row follows the hero from node to node
      buildQuick();
      heroUi.refresh(true);
      updateStats();
    }
    renderer.resetAnimation(sim);
    return;
  }
  const raw = params.get('hero');
  if (raw !== null) {
    const p = raw.split(',').map((s) => s.trim().toLowerCase());
    const d = ['easy', 'medium', 'hard'].indexOf(p[2] ?? 'medium');
    begin(p[0] === 'mage' ? 1 : 0, p[1] === 'f' || p[1] === 'female', d < 0 ? 1 : d);
    return;
  }
  userPause = true;
  heroUi.showCreate(begin);
}

void renderer.init(sim).then(() => {
  ensureLootOverlay();
  initAltButton();
  setQuality(renderer.quality, true);
  if (combatMode) selectAll();
  if (missionError) toast(`${S.mission.loadFailed} ${missionError}`);
  const marks: { x: number; y: number; label: string; npc: boolean }[] = [];
  for (const t of sim.towns) {
    t.centre.forEach((c, role) => c && marks.push({ x: c[0], y: c[1] - 1.1, label: S.town.roles[role], npc: false }));
    for (const n of t.def.npcs ?? []) marks.push({ x: n.x + 0.5, y: n.y + 0.5, label: n.name, npc: true });
  }
  if (marks.length) renderer.setMarks(marks);
  if (resumed) {
    // Back exactly where the save was taken: no briefing, no hero creation, the same view.
    const ui = resumed.save.state.ui;
    if (sim.town.inside >= 0) sim.now({ type: 'town', op: 'leave', town: Math.floor(sim.town.inside / ROLE_COUNT) });
    missionUi?.resync(sim);
    renderer.zoom = ui.cam[2];
    renderer.camX = ui.cam[0];
    renderer.camY = ui.cam[1];
    renderer.clamp();
    ui.groups.forEach((g, n) => n > 0 && n <= GROUP_COUNT && groups.set(n, g));
    if (ui.slots.length === slots.length && ui.slots.every(validSlot)) slots = ui.slots.slice();
    buildQuick();
    selected.clear();
    for (const i of ui.selected) selected.add(i);
    userPause = false;
    lastAutosave = sim.tick;
  } else if (missionUi) {
    userPause = true;
    missionUi.briefing(() => (heroPresent ? startHero() : (userPause = false)));
  } else if (heroPresent) startHero();
  void saveUi.greet(resumed !== null);
  if (battle) {
    const a = [...Array(150).keys()];
    pending.push({ type: 'order', order: 'swarm', ids: a, x: 38, y: map.h - 9 });
    pending.push({ type: 'order', order: 'swarm', ids: a.map((i) => i + 150), x: 10, y: map.h - 9 });
  }
  lastNow = performance.now();
  renderer.resetAnimation(sim);
  requestAnimationFrame(frame);
  // Test and debug hook: deterministic access for the Playwright smoke test and the device bench.
  (window as unknown as { __game: unknown }).__game = {
    sim,
    selected: () => [...selected],
    unitScreen: (i: number) => renderer.unitScreen(i),
    unitArt: (i: number) => renderer.unitArt(i),
    animation: (i: number) => renderer.animationPose(sim, i),
    step: (n = 1): number => {
      if (!userPause || hidden || !Number.isSafeInteger(n) || n < 1 || n > 125)
        throw new Error('Diagnostic stepping requires an explicit pause and 1..125 steps');
      for (let i = 0; i < n; i++) advanceStep();
      return sim.tick;
    },
    previewArt: () => renderer.previewArt(),
    artMetrics: () => renderer.artMetrics(),
    stats: () => ({ ...live, reportAtMs: lastReport, quality: renderer.quality,
      resolution: renderer.app.renderer.resolution, paused: hidden || userPause }),
    tile: (x: number, y: number) => [Math.round(x * TILE * renderer.zoom - renderer.camX), Math.round(y * TILE * renderer.zoom - renderer.camY)],
    posTiles: (i: number) => [sim.x[i] / FP, sim.y[i] / FP],
    zoom: () => renderer.zoom,
    groups,
    speed: () => SPEEDS[speedIdx],
    centerOn: (x: number, y: number) => renderer.centerOn(x, y),
    paused: () => hidden || userPause,
    armed: () => armed,
    order: orderButton,
    spells: SPELLS,
    slots: () => slots,
    castSlot,
    armSpell,
    curSpell: () => curSpell,
    aim: () => aimView,
    openBook,
    spellbook: spellbookUi,
    activeRmbSpell: () => activeRmbSpell,
    setActiveRmb: (sid: number | null) => { activeRmbSpell = sid; },
    toggleAuto,
    heroUi,
    useItemSlot,
    mission: missionUi,
    townUi,
    saveUi,
    pauseMenu: () => pauseMenu,
    townTap,
    controls: () => controlMode,
    setControls: (mode: 'wasd' | 'mouse') => {
      controlMode = mode;
      try { localStorage.setItem('thornvael.controls', controlMode); } catch {}
      updateControlModeUI();
    },
    cameraFollow: () => cameraFollow,
    setCameraFollow: (on: boolean) => { cameraFollow = on; },
  };
}).catch((e) => { console.error('renderer init failed', e); });

// HUD: keep --hud-top just under the (possibly wrapped) top bar so quest tracker, objectives and minimap never overlap it.
{
  const barEl = document.querySelector<HTMLElement>('.bar');
  if (barEl) {
    const sync = (): void => {
      const r = barEl.getBoundingClientRect();
      document.documentElement.style.setProperty('--hud-top', `${Math.ceil(r.bottom) + 6}px`);
    };
    sync();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(sync).observe(barEl);
    window.addEventListener('resize', sync);
  }
}
