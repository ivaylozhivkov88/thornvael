/**
 * Mobile Virtual Analog Movement Stick (Phase 11).
 * Provides a responsive, translucent 360-degree virtual joystick
 * in the lower-left corner for direct hero movement on mobile and touch devices.
 */

export interface VirtualStickOptions {
  radius?: number;
  onVectorChange?: (dx: number, dy: number) => void;
}

export class VirtualStick {
  public readonly root: HTMLElement;
  private readonly base: HTMLElement;
  private readonly thumb: HTMLElement;

  private active = false;
  private pointerId: number | null = null;
  private centerX = 0;
  private centerY = 0;
  private radius = 42;

  private vecX = 0;
  private vecY = 0;
  private enabled = true;

  constructor(opts?: VirtualStickOptions) {
    if (opts?.radius) this.radius = opts.radius;

    this.root = document.createElement('div');
    this.root.id = 'virtual-stick-container';
    this.root.className = 'virtual-stick-container';

    this.base = document.createElement('div');
    this.base.className = 'virtual-stick-base';

    this.thumb = document.createElement('div');
    this.thumb.className = 'virtual-stick-thumb';

    const innerRing = document.createElement('div');
    innerRing.className = 'virtual-stick-ring';

    this.base.append(innerRing, this.thumb);
    this.root.append(this.base);

    // Default auto-detect: show on touch devices or if explicitly enabled
    let pref = 'auto';
    try {
      pref = localStorage.getItem('thornvael.virtualStick') ?? 'auto';
    } catch {
      // storage unavailable
    }

    const isTouchDevice =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0));

    if (pref === 'off') {
      this.enabled = false;
    } else if (pref === 'on') {
      this.enabled = true;
    } else {
      this.enabled = Boolean(isTouchDevice);
    }

    this.root.style.display = this.enabled ? 'block' : 'none';

    this.bindEvents();
    document.body.append(this.root);
  }

  private bindEvents(): void {
    const handleDown = (clientX: number, clientY: number, id: number) => {
      if (!this.enabled) return;
      this.active = true;
      this.pointerId = id;
      const rect = this.base.getBoundingClientRect();
      this.centerX = rect.left + rect.width / 2;
      this.centerY = rect.top + rect.height / 2;
      this.updatePosition(clientX, clientY);
    };

    const handleMove = (clientX: number, clientY: number) => {
      if (!this.active) return;
      this.updatePosition(clientX, clientY);
    };

    const handleUp = () => {
      if (!this.active) return;
      this.active = false;
      this.pointerId = null;
      this.vecX = 0;
      this.vecY = 0;
      this.thumb.style.transform = 'translate(0px, 0px)';
    };

    this.base.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.base.setPointerCapture(e.pointerId);
      handleDown(e.clientX, e.clientY, e.pointerId);
    });

    this.base.addEventListener('pointermove', (e) => {
      if (this.pointerId === e.pointerId) {
        e.preventDefault();
        e.stopPropagation();
        handleMove(e.clientX, e.clientY);
      }
    });

    const endHandler = (e: PointerEvent) => {
      if (this.pointerId === e.pointerId) {
        e.preventDefault();
        e.stopPropagation();
        handleUp();
      }
    };

    this.base.addEventListener('pointerup', endHandler);
    this.base.addEventListener('pointercancel', endHandler);
  }

  private updatePosition(clientX: number, clientY: number): void {
    const rawDx = clientX - this.centerX;
    const rawDy = clientY - this.centerY;
    const dist = Math.hypot(rawDx, rawDy);

    if (dist < 4) {
      this.vecX = 0;
      this.vecY = 0;
      this.thumb.style.transform = 'translate(0px, 0px)';
      return;
    }

    const clampedDist = Math.min(dist, this.radius);
    const angle = Math.atan2(rawDy, rawDx);
    const offsetX = Math.cos(angle) * clampedDist;
    const offsetY = Math.sin(angle) * clampedDist;

    this.thumb.style.transform = `translate(${offsetX.toFixed(1)}px, ${offsetY.toFixed(1)}px)`;

    // Normalized directional vector [-1.0, 1.0]
    this.vecX = offsetX / this.radius;
    this.vecY = offsetY / this.radius;
  }

  /** Current normalized analog movement vector */
  getMovementVector(): [number, number] {
    if (!this.enabled || !this.active) return [0, 0];
    return [this.vecX, this.vecY];
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.root.style.display = on ? 'block' : 'none';
    if (!on) {
      this.active = false;
      this.vecX = 0;
      this.vecY = 0;
    }
    try {
      localStorage.setItem('thornvael.virtualStick', on ? 'on' : 'off');
    } catch {
      // storage unavailable
    }
  }

  destroy(): void {
    this.root.remove();
  }
}
