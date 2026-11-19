export type MinimapPingKind = 'alert' | 'attack' | 'defend' | 'move' | 'waypoint';

export interface MinimapPing {
  id: number;
  tileX: number;
  tileY: number;
  kind: MinimapPingKind;
  createdAtMs: number;
  durationMs: number;
  label?: string;
}

export interface ActiveMinimapPing extends MinimapPing {
  /** Normalized lifetime progress in [0, 1]. */
  progress: number;
  /** Smoothly decaying opacity in [0, 1]. */
  alpha: number;
  /** Expanding outer ring radius in pixels. */
  pulseRadius: number;
}

export interface MinimapPingQueueOptions {
  maxPings?: number;
  defaultDurationMs?: number;
  maxPulseRadius?: number;
}

const PING_COLORS: Record<MinimapPingKind, string> = {
  alert: '#ff5a4a',
  attack: '#ff9638',
  defend: '#58b4ff',
  move: '#7cf08a',
  waypoint: '#f6d66b',
};

export function getPingColor(kind: MinimapPingKind): string {
  return PING_COLORS[kind] ?? PING_COLORS.alert;
}

export class MinimapPingQueue {
  private readonly maxPings: number;
  private readonly defaultDurationMs: number;
  private readonly maxPulseRadius: number;
  private readonly pings: MinimapPing[] = [];
  private nextId = 1;

  constructor(opts: MinimapPingQueueOptions = {}) {
    this.maxPings = Math.max(1, opts.maxPings ?? 12);
    this.defaultDurationMs = Math.max(250, opts.defaultDurationMs ?? 3000);
    this.maxPulseRadius = Math.max(6, opts.maxPulseRadius ?? 16);
  }

  push(
    tileX: number,
    tileY: number,
    kind: MinimapPingKind = 'alert',
    nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now(),
    label?: string,
    durationMs = this.defaultDurationMs,
  ): MinimapPing {
    this.prune(nowMs);
    const ping: MinimapPing = {
      id: this.nextId++,
      tileX,
      tileY,
      kind,
      createdAtMs: nowMs,
      durationMs: Math.max(100, durationMs),
      label,
    };
    this.pings.push(ping);
    while (this.pings.length > this.maxPings) {
      this.pings.shift();
    }
    return ping;
  }

  prune(nowMs: number): number {
    let removed = 0;
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i];
      if (nowMs - p.createdAtMs >= p.durationMs) {
        this.pings.splice(i, 1);
        removed++;
      }
    }
    return removed;
  }

  getActivePings(nowMs: number): ActiveMinimapPing[] {
    this.prune(nowMs);
    const result: ActiveMinimapPing[] = [];
    for (const p of this.pings) {
      const elapsed = Math.max(0, nowMs - p.createdAtMs);
      const progress = Math.min(1, elapsed / p.durationMs);
      const alpha = Math.max(0, 1 - progress * progress);
      const wave = (progress * 2.5) % 1;
      const pulseRadius = 3 + wave * this.maxPulseRadius;
      result.push({ ...p, progress, alpha, pulseRadius });
    }
    return result;
  }

  size(): number {
    return this.pings.length;
  }

  clear(): void {
    this.pings.length = 0;
  }
}

export function drawMinimapPings(
  ctx: CanvasRenderingContext2D,
  queue: MinimapPingQueue,
  scale: number,
  nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now(),
): number {
  const active = queue.getActivePings(nowMs);
  if (active.length === 0) return 0;

  ctx.save?.();
  for (const p of active) {
    const cx = (p.tileX + 0.5) * scale;
    const cy = (p.tileY + 0.5) * scale;
    const color = getPingColor(p.kind);

    ctx.globalAlpha = p.alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, p.pulseRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 3);
    ctx.lineTo(cx + 3, cy);
    ctx.lineTo(cx, cy + 3);
    ctx.lineTo(cx - 3, cy);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore?.();
  return active.length;
}
