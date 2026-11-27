import { actOf, nodeOf, townNodeForAct, townSeed, type Campaign } from './campaign';
import { writeRecord } from './campaignstore';
import { extractCarryover } from './carryover';
import { ascendCharacterToNewGamePlus, type Character } from './characters';
import { WaypointTravelModal } from './connected-world';
import { afterMission, afterTown, nodeUrl, saveAndExitRecord, type CampaignRecord } from './flow';
import type { LoadedMission } from './mapdoc';
import { AUTO, deleteSave } from './savedb';
import type { ZoneExitDef } from './sim/script';
import { FP, type Sim } from './sim/sim';
import { endingForCompletedNode } from './story';
import { S } from './strings';
import { takeItem } from './sim/hero';
import { itemId } from './sim/items';

export interface CampaignLifecycleContext {
  getSim: () => Sim;
  getOutcome: () => 'win' | 'lose' | null;
  getCampaign: () => Campaign | null;
  getCampaignId: () => string | null;
  getCrec: () => CampaignRecord | null;
  setCrec: (next: CampaignRecord) => void;
  getActiveChar: () => Character | null;
  getLoadedMission: () => LoadedMission | null;
  getMissionName: () => string | null;
  getIsTownNode: () => boolean;
  getSlots: () => number[];
  alive: (id: number) => boolean;
  army: () => [number, number];
  setUserPause: (paused: boolean) => void;
  centerCamera?: (tx: number, ty: number) => void;
  toast: (msg: string) => void;
  playSfx: (name: string, priority: number) => void;
  closeAllOverlays: () => void;
  closeTownUi: () => void;
  persistChar: (finished: boolean, clearedDifficulty?: number) => Promise<boolean>;
  saveRecord?: (rec: CampaignRecord) => Promise<unknown>;
}

export interface CampaignLifecycleController {
  withCharParam: (url: string) => string;
  castTownPortal: () => Promise<void>;
  returnThroughTownPortal: () => Promise<void>;
  triggerWaypointTravel: () => void;
  transitionToZone: (exit: ZoneExitDef) => Promise<void>;
  saveAndExit: () => Promise<void>;
  endNode: (win: boolean, text: string, dest?: 'town' | 'map') => Promise<void>;
  toMap: () => Promise<void>;
}

export function createCampaignLifecycle(ctx: CampaignLifecycleContext): CampaignLifecycleController {
  const waypointModal = new WaypointTravelModal();
  let isTransitioning = false;
  const persistRecord = (r: CampaignRecord): Promise<unknown> => (ctx.saveRecord ? ctx.saveRecord(r) : writeRecord(r));

  const withCharParam = (url: string): string => {
    const activeChar = ctx.getActiveChar();
    return activeChar && !url.includes('char=')
      ? `${url}${url.includes('?') ? '&' : '?'}char=${encodeURIComponent(activeChar.id)}`
      : url;
  };

  async function returnThroughTownPortal(): Promise<void> {
    const campaign = ctx.getCampaign();
    const crec = ctx.getCrec();
    if (!campaign || !crec || !crec.progress.townPortal) return;
    const tp = crec.progress.townPortal;
    crec.progress.townPortal = null;
    ctx.toast('🌀 Returning through the Town Portal to the wilderness...');
    ctx.playSfx('cast_water', 5);

    const sim = ctx.getSim();
    const targetNode = nodeOf(campaign, tp.zoneNodeId);
    const carry = sim.hero
      ? extractCarryover(sim, crec.progress, townSeed(1, crec.progress.townVisits + 1), ctx.getSlots())
      : null;
    crec.progress.node = targetNode.id;
    crec.carry = carry;
    await persistRecord(crec);
    await deleteSave(AUTO).catch(() => undefined);
    location.assign(withCharParam(`${nodeUrl(targetNode)}&spawnX=${tp.x}&spawnY=${tp.y}&session=${crec.progress.sessionSeed ?? 1234567}`));
  }

  async function castTownPortal(): Promise<void> {
    if (ctx.getOutcome()) return;
    const sim = ctx.getSim();
    if (!sim.hero || !ctx.alive(sim.hero.id)) {
      ctx.toast(S.hero.noHero);
      return;
    }
    const crec = ctx.getCrec();
    const tpScrollId = itemId('Scroll of Town Portal');
    const hasScroll = tpScrollId >= 0 && sim.hero.inv.some((s) => s.item === tpScrollId && s.n > 0);
    if (!hasScroll && ctx.getIsTownNode()) {
      if (crec?.progress.townPortal) {
        void returnThroughTownPortal();
        return;
      }
    }
    if (!hasScroll) {
      ctx.toast('A Scroll of Town Portal is required!');
      return;
    }
    takeItem(sim.hero, tpScrollId);
    ctx.toast('🌀 A blue Town Portal to town has opened!');
    ctx.playSfx('cast_water', 5);

    const campaign = ctx.getCampaign();
    const campaignId = ctx.getCampaignId();
    if (campaign && crec && campaignId) {
      const hx = Math.floor(sim.x[sim.hero.id] / FP);
      const hy = Math.floor(sim.y[sim.hero.id] / FP);
      const loadedMission = ctx.getLoadedMission();
      crec.progress.townPortal = {
        zoneNodeId: campaignId,
        map: loadedMission?.doc.name || ctx.getMissionName() || 'zone',
        x: hx,
        y: hy,
      };
      const currentAct = actOf(nodeOf(campaign, campaignId));
      const townNode = townNodeForAct(campaign, currentAct);
      const carry = extractCarryover(sim, crec.progress, townSeed(1, crec.progress.townVisits + 1), ctx.getSlots());
      crec.progress.node = townNode.id;
      crec.carry = carry;
      await persistRecord(crec);
      await deleteSave(AUTO).catch(() => undefined);
      location.assign(withCharParam(`${nodeUrl(townNode)}&tpReturn=1`));
    }
  }

  function triggerWaypointTravel(): void {
    const campaign = ctx.getCampaign();
    const crec = ctx.getCrec();
    if (!campaign || !crec) return;
    const campaignId = ctx.getCampaignId();
    const currentAct = campaignId ? actOf(nodeOf(campaign, campaignId)) : 1;
    const loadedDoc = ctx.getLoadedMission()?.doc;
    const worldWaypoints = loadedDoc?.zones && loadedDoc.zones.length > 1 ? loadedDoc.waypoints : undefined;
    ctx.setUserPause(true);
    waypointModal.open({
      campaign,
      rec: crec,
      currentAct,
      currentNodeId: campaignId ?? '',
      worldWaypoints,
      onTeleport: (wp) => {
        const sim = ctx.getSim();
        if (sim.hero && ctx.alive(sim.hero.id)) {
          const hid = sim.hero.id;
          sim.place(hid, wp.x, wp.y);
          let placed = 0;
          for (let u = 0; u < sim.count; u++) {
            if (u === hid || sim.team[u] !== 0 || sim.hidden[u] || sim.cb.hp[u] <= 0) continue;
            const a = (placed * 2.4) % (Math.PI * 2);
            sim.place(u, wp.x + Math.cos(a) * 1.4, wp.y + Math.sin(a) * 1.4);
            placed++;
          }
          sim.updateFog();
          ctx.centerCamera?.(wp.x, wp.y);
        }
        ctx.toast(`⚡ Warped to ${wp.name}`);
        ctx.playSfx('cast_astral', 5);
        ctx.setUserPause(false);
      },
      onTravel: (targetNode) => {
        void (async () => {
          const sim = ctx.getSim();
          ctx.toast(`⚡ Teleporting to ${targetNode.title}...`);
          ctx.playSfx('cast_astral', 5);
          const carry = sim.hero
            ? extractCarryover(sim, crec.progress, townSeed(1, crec.progress.townVisits + 1), ctx.getSlots())
            : null;
          crec.progress.node = targetNode.id;
          crec.carry = carry;
          await persistRecord(crec);
          await deleteSave(AUTO).catch(() => undefined);
          const url = withCharParam(`${nodeUrl(targetNode)}&session=${crec.progress.sessionSeed ?? 1234567}`);
          location.assign(url);
        })();
      },
      onClose: () => {
        ctx.setUserPause(false);
      },
    });
  }

  async function transitionToZone(exit: ZoneExitDef): Promise<void> {
    if (isTransitioning) return;
    isTransitioning = true;
    ctx.setUserPause(true);
    ctx.toast(`🚪 Travelling to adjacent zone: ${exit.label || exit.targetMap}...`);
    ctx.playSfx('select_hero', 5);

    const campaign = ctx.getCampaign();
    const crec = ctx.getCrec();
    const campaignId = ctx.getCampaignId();
    if (campaign && crec) {
      const targetNode = campaign.nodes.find((n) => n.id === exit.targetMap || n.map === exit.targetMap);
      if (targetNode) {
        const alreadyOpen = targetNode.kind === 'town' || crec.progress.unlocked.includes(targetNode.id);
        const currentCleared = campaignId ? crec.progress.completed.includes(campaignId) : false;
        if (!alreadyOpen && !currentCleared) {
          isTransitioning = false;
          ctx.setUserPause(false);
          ctx.toast(`Complete the current mission to unlock ${targetNode.title}.`);
          return;
        }
        const sim = ctx.getSim();
        const carry = sim.hero
          ? extractCarryover(sim, crec.progress, townSeed(1, crec.progress.townVisits + 1), ctx.getSlots())
          : null;
        if (!crec.progress.unlocked.includes(targetNode.id)) {
          crec.progress.unlocked.push(targetNode.id);
        }
        crec.progress.node = targetNode.id;
        crec.carry = carry;
        await persistRecord(crec);
        await deleteSave(AUTO).catch(() => undefined);
        const url = withCharParam(`${nodeUrl(targetNode)}&spawnX=${exit.targetX}&spawnY=${exit.targetY}&session=${crec.progress.sessionSeed ?? 1234567}`);
        location.assign(url);
        return;
      }
    }

    location.assign(`./?mission=${encodeURIComponent(exit.targetMap)}&spawnX=${exit.targetX}&spawnY=${exit.targetY}`);
  }

  async function saveAndExit(): Promise<void> {
    if (ctx.getOutcome()) return;
    ctx.setUserPause(true);
    ctx.toast('💾 Saving character & exiting... Returning to Town Hub...');
    ctx.closeAllOverlays();

    const campaign = ctx.getCampaign();
    const crec = ctx.getCrec();
    const sim = ctx.getSim();
    if (campaign && crec) {
      const carry = sim.hero
        ? extractCarryover(sim, crec.progress, townSeed(1, crec.progress.townVisits + 1), ctx.getSlots())
        : null;
      const updated = saveAndExitRecord(campaign, crec, carry);
      ctx.setCrec(updated);
      await persistRecord(updated);
      await deleteSave(AUTO).catch(() => undefined);
    }
    location.assign('./');
  }

  async function endNode(win: boolean, text: string, dest: 'town' | 'map' = 'map'): Promise<void> {
    const campaign = ctx.getCampaign()!;
    const campaignId = ctx.getCampaignId()!;
    const crec0 = ctx.getCrec()!;
    const sim = ctx.getSim();
    const [up, size] = ctx.army();
    const carry = win && sim.hero ? extractCarryover(sim, crec0.progress, townSeed(1, crec0.progress.townVisits), ctx.getSlots()) : null;
    if (carry?.upkeep) ctx.toast(`${S.touch.upkeep}: -${carry.upkeep} ${S.gold}`);
    const hasEndingCutscene = Boolean(win && endingForCompletedNode(campaignId));
    if (win) await ctx.persistChar(true, hasEndingCutscene ? crec0.progress.difficulty : undefined).catch(() => false);
    const branch = sim.script?.st.sv[0] ?? 0;
    const lastResult: { text: string; up: number; size: number; gold: number; branch?: number } = {
      text,
      up,
      size,
      gold: sim.cb.gold[0],
      ...(branch ? { branch } : {}),
    };
    let crec = afterMission(campaign, crec0, campaignId, win, carry, lastResult);
    const currentNode = nodeOf(campaign, campaignId);
    const activeChar = ctx.getActiveChar();
    if (hasEndingCutscene && activeChar) {
      const promoted = ascendCharacterToNewGamePlus(activeChar, crec.progress.difficulty);
      Object.assign(activeChar, promoted.character);
    }
    const townNode = win && dest === 'town' && !hasEndingCutscene && currentNode.kind === 'mission'
      ? townNodeForAct(campaign, actOf(currentNode))
      : null;
    const canGoTown = Boolean(townNode && crec.progress.unlocked.includes(townNode.id));
    if (canGoTown && townNode) {
      const nextProgress = { ...crec.progress, node: townNode.id };
      crec = {
        ...crec,
        progress: nextProgress,
        carry: crec.carry ? { ...crec.carry, progress: nextProgress } : crec.carry,
        last: null,
      };
    }
    ctx.setCrec(crec);
    await persistRecord(crec);
    await deleteSave(AUTO).catch(() => undefined);
    if (canGoTown && townNode) {
      location.assign(withCharParam(nodeUrl(townNode)));
    } else {
      location.assign('./?menu=map');
    }
  }

  async function toMap(): Promise<void> {
    const campaign = ctx.getCampaign();
    const crec0 = ctx.getCrec();
    const campaignId = ctx.getCampaignId();
    const sim = ctx.getSim();
    if (campaign && crec0 && campaignId && nodeOf(campaign, campaignId).kind === 'town' && !ctx.getOutcome()) {
      ctx.closeTownUi();
      const carry = sim.hero
        ? extractCarryover(sim, crec0.progress, townSeed(1, crec0.progress.townVisits + 1), ctx.getSlots())
        : null;
      await ctx.persistChar(false).catch(() => false);
      const crec = afterTown(campaign, crec0, campaignId, carry);
      ctx.setCrec(crec);
      await persistRecord(crec);
      await deleteSave(AUTO).catch(() => undefined);
    }
    const isAct1 = campaign && campaignId ? actOf(nodeOf(campaign, campaignId)) === 1 : false;
    location.assign(isAct1 ? './?menu=hub' : './?menu=map');
  }

  return {
    withCharParam,
    castTownPortal,
    returnThroughTownPortal,
    triggerWaypointTravel,
    transitionToZone,
    saveAndExit,
    endNode,
    toMap,
  };
}
