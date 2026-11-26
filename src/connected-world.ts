import type { MapDoc, ZoneExitDef, } from './mapdoc';
import { actOf, nodeOf, townNodeForAct, type Campaign, type CampaignNode } from './campaign';
import { type CampaignRecord } from './flow';

/**
 * Ensures that a mission map has connected world exits to neighboring zones
 * (town gate, backward road, forward road) based on campaign progression.
 */
export function ensureConnectedWorldExits(
  doc: MapDoc,
  campaign: Campaign | null,
  campaignId: string | null,
): ZoneExitDef[] {
  if (doc.exits && doc.exits.length > 0) {
    return doc.exits;
  }

  const exits: ZoneExitDef[] = [];
  if (!campaign || !campaignId) return exits;

  try {
    const currentNode = nodeOf(campaign, campaignId);
    const act = actOf(currentNode);
    const townNode = townNodeForAct(campaign, act);
    const w = doc.w;
    const h = doc.h;

    if (currentNode.kind === 'town') {
      // In Town Hub: exit gate leading out to the first wilderness mission of the Act
      const firstMission = campaign.nodes.find(
        (n) => actOf(n) === act && n.kind === 'mission' && n.unlocksOnVictory.length > 0,
      );
      if (firstMission) {
        exits.push({
          x: Math.min(w - 2, Math.round(w * 0.9)),
          y: Math.round(h * 0.5),
          targetMap: firstMission.map,
          targetX: 4,
          targetY: Math.round(h * 0.5),
          label: `Wilderness Gate: ${firstMission.title}`,
          kind: 'gate',
        });
      }
    } else {
      // In Wilderness Mission:
      // 1. Backward exit: return to Town or previous mission
      exits.push({
        x: 2,
        y: Math.round(h * 0.5),
        targetMap: townNode.map,
        targetX: Math.round(w * 0.5),
        targetY: Math.round(h * 0.5),
        label: `Road to ${townNode.title}`,
        kind: 'road',
      });

      // 2. Forward exits: connect to next unlocked nodes in campaign
      for (const nextId of currentNode.unlocksOnVictory) {
        const nextNode = campaign.nodes.find((n) => n.id === nextId);
        if (nextNode && nextNode.kind === 'mission') {
          exits.push({
            x: w - 3,
            y: Math.round(h * 0.5),
            targetMap: nextNode.map,
            targetX: 3,
            targetY: Math.round(h * 0.5),
            label: `Path to ${nextNode.title}`,
            kind: 'road',
          });
          break; // First primary forward path
        }
      }
    }
  } catch {
    // If lookup fails, return empty
  }

  return exits;
}

export interface WaypointTravelCtx {
  campaign: Campaign;
  rec: CampaignRecord;
  currentAct: 1 | 2 | 3 | 4;
  currentNodeId: string;
  onTravel: (targetNode: CampaignNode) => void;
  onClose: () => void;
}

export class WaypointTravelModal {
  private readonly root: HTMLElement | null;

  constructor(rootEl?: HTMLElement) {
    if (typeof document === 'undefined') {
      this.root = rootEl ?? null;
      return;
    }
    let el = rootEl ?? document.getElementById('waypoint-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'waypoint-modal';
      document.body.append(el);
    }
    this.root = el;
    this.root.className = 'waypoint-modal-backdrop';
    this.root.hidden = true;
  }

  get isOpen(): boolean {
    return this.root ? !this.root.hidden : false;
  }

  open(ctx: WaypointTravelCtx): void {
    if (!this.root || typeof document === 'undefined') {
      // In headless test mode without DOM, immediately invoke travel or close
      return;
    }
    this.root.replaceChildren();
    this.root.hidden = false;

    const modal = document.createElement('div');
    modal.className = 'waypoint-modal-dialog gothic-modal';

    // Header
    const head = document.createElement('div');
    head.className = 'waypoint-modal-head';

    const title = document.createElement('h3');
    title.className = 'waypoint-modal-title';
    title.textContent = '🗿 Waypoint Network';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'waypoint-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => this.close(ctx.onClose);

    head.append(title, closeBtn);

    const desc = document.createElement('p');
    desc.className = 'waypoint-modal-desc';
    desc.textContent = 'Select an unlocked Waypoint to warp your company across Act ' + ctx.currentAct + ':';

    // Waypoint List
    const list = document.createElement('div');
    list.className = 'waypoint-list';

    const unlockedWpSet = new Set(ctx.rec.progress.waypoints ?? []);
    // Always include the Town Hub of current Act
    const townNode = townNodeForAct(ctx.campaign, ctx.currentAct);
    unlockedWpSet.add(townNode.id);

    // Collect all campaign nodes of the current Act that are towns or unlocked waypoints
    const actNodes = ctx.campaign.nodes.filter(
      (n) => actOf(n) === ctx.currentAct && (n.kind === 'town' || unlockedWpSet.has(n.id)),
    );

    for (const node of actNodes) {
      const isCurrent = node.id === ctx.currentNodeId;
      const isTown = node.kind === 'town';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `waypoint-btn ${isCurrent ? 'current' : ''} ${isTown ? 'town' : ''}`;
      btn.disabled = isCurrent;

      const icon = document.createElement('span');
      icon.className = 'waypoint-btn-icon';
      icon.textContent = isTown ? '🏰' : '🗿';

      const labelBox = document.createElement('div');
      labelBox.className = 'waypoint-btn-info';

      const name = document.createElement('strong');
      name.textContent = `${node.title}${isTown ? ' (Town Hub)' : ''}`;

      const status = document.createElement('small');
      status.textContent = isCurrent ? '● You are here' : '⚡ Click to Warp';

      labelBox.append(name, status);
      btn.append(icon, labelBox);

      btn.onclick = () => {
        this.close();
        ctx.onTravel(node);
      };

      list.append(btn);
    }

    modal.append(head, desc, list);
    this.root.append(modal);
  }

  close(onClose?: () => void): void {
    if (this.root) {
      this.root.hidden = true;
      this.root.replaceChildren();
    }
    if (onClose) onClose();
  }
}
