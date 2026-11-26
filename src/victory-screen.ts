import { play, playEndingMusic, setMusic } from './audio';
import type { Campaign, CampaignNode } from './campaign';
import { actOf, nodeOf, townNodeForAct } from './campaign';
import type { CampaignRecord } from './flow';
import { readPreferences } from './preferences';
import { Kind } from './sim/combat';
import { getItemDef } from './sim/items';
import { TICKS_PER_SECOND, type Sim } from './sim/sim';
import { endingForCompletedNode } from './story';
import { S } from './strings';

export interface VictoryScreenContext {
  sim: Sim;
  campaign: Campaign | null;
  campaignId: string | null;
  crec: CampaignRecord | null;
  army: () => [number, number];
  onClearOutcomeForFreeRoam: () => void;
  onFinalize: (win: boolean, narrative: string, dest: 'town' | 'map') => Promise<void>;
  toast: (msg: string) => void;
}

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

export function showVictoryScreen(ctx: VictoryScreenContext, winText?: string): void {
  const { sim, campaign, campaignId, crec, army } = ctx;
  const modal = getVictoryModal();
  modal.replaceChildren();
  modal.className = 'gothic-victory-overlay';

  try {
    play('loot_unique', 5);
    play('loot_set', 4);
    setMusic(true, 'town');
  } catch {
    // audio optional
  }

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

  const narrative =
    winText && winText !== S.victoryBody
      ? winText
      : "With Chieftain Grok'tar slain, the remaining gnoll packs shatter into the high crags. The river crossing is secured, and Thornwick's border lanterns burn steadily through the mist.";

  const aftermathBox = document.createElement('div');
  aftermathBox.className = 'victory-aftermath-box';
  aftermathBox.innerHTML = `
    <div class="aftermath-label">✦ NARRATIVE AFTERMATH ✦</div>
    <p class="aftermath-text" style="white-space:pre-line">${narrative}</p>
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

  const currentNode: CampaignNode | null = campaign && campaignId ? nodeOf(campaign, campaignId) : null;
  const hasEndingCutscene = Boolean(campaignId && endingForCompletedNode(campaignId));
  if (hasEndingCutscene && readPreferences().music) {
    if (campaignId === 'm45-crown-of-order') playEndingMusic('crown');
    else if (campaignId === 'm46-ember-reckoning') playEndingMusic('ember');
  }
  const actTown = currentNode && currentNode.kind === 'mission' ? townNodeForAct(campaign!, actOf(currentNode)) : null;
  const canReturnToTown = Boolean(
    !hasEndingCutscene &&
      campaign &&
      crec &&
      currentNode &&
      actTown &&
      (crec.progress.unlocked.includes(actTown.id) || currentNode.unlocksOnVictory.includes(actTown.id)),
  );

  const leaveBtn = document.createElement('button');
  leaveBtn.className = 'btn-gothic btn-victory-primary';
  leaveBtn.textContent =
    canReturnToTown && actTown
      ? `Return to ${actTown.title} 🏰`
      : campaign && crec && campaignId
        ? 'Return to World Map ❯'
        : 'Return to Menu ❯';

  const mapBtn = canReturnToTown ? document.createElement('button') : null;
  if (mapBtn) {
    mapBtn.className = 'btn-gothic btn-victory-secondary';
    mapBtn.textContent = 'World Map 🗺️';
  }

  const freeRoamBtn = document.createElement('button');
  freeRoamBtn.className = 'btn-gothic btn-victory-secondary';
  freeRoamBtn.textContent = 'Explore Map (Free Roam) 🔍';

  const finalizeVictory = (dest: 'town' | 'map'): void => {
    leaveBtn.disabled = true;
    if (mapBtn) mapBtn.disabled = true;
    freeRoamBtn.disabled = true;
    modal.hidden = true;
    if (campaign && crec && campaignId && !victoryFinalized) {
      victoryFinalized = true;
      void ctx.onFinalize(true, narrative, dest);
    } else {
      location.assign('./');
    }
  };

  leaveBtn.onclick = () => finalizeVictory(canReturnToTown ? 'town' : 'map');
  if (mapBtn) mapBtn.onclick = () => finalizeVictory('map');

  freeRoamBtn.onclick = () => {
    modal.hidden = true;
    ctx.onClearOutcomeForFreeRoam();
    const leaveHudBtn = document.getElementById('btn-leave-mission');
    if (leaveHudBtn) {
      leaveHudBtn.hidden = false;
      if (canReturnToTown && actTown) leaveHudBtn.textContent = `Return to ${actTown.title} 🏰`;
      leaveHudBtn.onclick = () => {
        if (campaign && crec && campaignId && !victoryFinalized) {
          victoryFinalized = true;
          void ctx.onFinalize(true, narrative, canReturnToTown ? 'town' : 'map');
        } else {
          location.assign('./');
        }
      };
    }
    ctx.toast('Free Roam Active: Explore the map, gather loot, and return when ready.');
  };

  actionsBar.append(leaveBtn, ...(mapBtn ? [mapBtn] : []), freeRoamBtn);
  frame.append(header, aftermathBox, spoilsGrid, actionsBar);
  modal.append(frame);
  modal.hidden = false;
}

export function showDefeatScreen(ctx: VictoryScreenContext, defeatText?: string): void {
  const { sim, campaign, campaignId, crec, army } = ctx;
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
    <p class="aftermath-text" style="white-space:pre-line">${defeatText ?? 'Your hero has fallen in the treacherous waters of the ford. Without command, the company scatters before the gnoll onslaught.'}</p>
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
    retryBtn.disabled = true;
    leaveBtn.disabled = true;
    if (campaign && crec && campaignId) {
      void ctx.onFinalize(false, defeatText ?? '', 'map');
    } else {
      location.assign('./');
    }
  };

  actionsBar.append(retryBtn, leaveBtn);
  frame.append(header, aftermathBox, spoilsGrid, actionsBar);
  modal.append(frame);
  modal.hidden = false;
}
