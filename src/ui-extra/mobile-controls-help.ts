export interface GestureGuideItem {
  id: 'tap' | 'long-press' | 'drag-box' | 'pan-pinch' | 'virtual-stick';
  title: string;
  gesture: string;
  action: string;
  icon: string;
}

export const GESTURE_GUIDE_ITEMS: readonly GestureGuideItem[] = [
  {
    id: 'tap',
    title: 'Tap',
    gesture: 'Single quick tap',
    action: 'Select a unit, move, attack an enemy, or pick up loot.',
    icon: '◎',
  },
  {
    id: 'long-press',
    title: 'Long-Press',
    gesture: 'Hold 350ms on target',
    action: 'Right-click command: force attack, cast targeted spell, or inspect.',
    icon: '◉',
  },
  {
    id: 'drag-box',
    title: 'Drag-Box',
    gesture: 'Press and drag on ground',
    action: 'Draw a selection rectangle to command your hero and companions.',
    icon: '▢',
  },
  {
    id: 'pan-pinch',
    title: '2-Finger Pan & Pinch',
    gesture: 'Two fingers drag / spread',
    action: 'Pan the camera across the battlefield and pinch to zoom in or out.',
    icon: '⤢',
  },
  {
    id: 'virtual-stick',
    title: 'Virtual Stick',
    gesture: 'Lower-left analog pad',
    action: 'Steer your hero directly in 360 degrees during combat or exploration.',
    icon: '⊕',
  },
];

export interface MobileControlsHelpOptions {
  parent?: HTMLElement;
  onClose?: () => void;
}

const STYLE_ID = 'tv-mobile-help-style';

function ensureStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .tv-mhelp-backdrop {
      position: fixed;
      inset: 0;
      height: 100dvh;
      max-height: 100dvh;
      overflow: hidden;
      background: rgba(8, 7, 10, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: clamp(6px, 1.5vh, 18px);
      z-index: 960;
      box-sizing: border-box;
      font-family: Georgia, serif;
      color: #efe4cf;
    }
    .tv-mhelp-backdrop[hidden] { display: none; }
    .tv-mhelp-card {
      width: min(820px, 96vw);
      max-height: 94dvh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: linear-gradient(180deg, #1d1713 0%, #110d0b 100%);
      border: 1px solid #6b5335;
      border-radius: 6px;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.75);
      padding: clamp(8px, 1.8vh, 16px) clamp(10px, 2vw, 20px);
      box-sizing: border-box;
      gap: clamp(6px, 1.2vh, 12px);
    }
    .tv-mhelp-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(190, 154, 96, 0.25);
      padding-bottom: clamp(4px, 0.9vh, 8px);
      flex: 0 0 auto;
    }
    .tv-mhelp-title {
      margin: 0;
      font-size: clamp(15px, 2vw, 20px);
      color: #f3d79b;
    }
    .tv-mhelp-sub {
      margin: 0;
      font-size: clamp(11px, 1.4vh, 13px);
      color: #cbbba0;
      flex: 0 0 auto;
    }
    .tv-mhelp-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: clamp(6px, 1.2vh, 12px);
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
      align-content: center;
    }
    @media (max-width: 700px) {
      .tv-mhelp-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    .tv-mhelp-item {
      background: rgba(12, 9, 8, 0.55);
      border: 1px solid rgba(168, 134, 82, 0.25);
      border-radius: 4px;
      padding: clamp(6px, 1.2vh, 11px);
      display: flex;
      flex-direction: column;
      gap: clamp(3px, 0.6vh, 6px);
      min-height: 0;
    }
    .tv-mhelp-item-head {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: clamp(12px, 1.6vh, 15px);
      font-weight: bold;
      color: #f5dda6;
    }
    .tv-mhelp-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: clamp(22px, 3vh, 28px);
      height: clamp(22px, 3vh, 28px);
      border-radius: 4px;
      background: rgba(108, 75, 34, 0.45);
      border: 1px solid rgba(224, 179, 99, 0.4);
      font-size: clamp(13px, 1.8vh, 16px);
      flex: 0 0 auto;
    }
    .tv-mhelp-gesture {
      font-size: clamp(10px, 1.3vh, 12px);
      color: #d6b67c;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .tv-mhelp-desc {
      margin: 0;
      font-size: clamp(11px, 1.45vh, 13px);
      line-height: 1.3;
      color: #e4dac8;
    }
    .tv-mhelp-foot {
      display: flex;
      justify-content: flex-end;
      border-top: 1px solid rgba(190, 154, 96, 0.22);
      padding-top: clamp(4px, 0.9vh, 8px);
      flex: 0 0 auto;
    }
    .tv-mhelp-btn {
      background: linear-gradient(180deg, #5d401e 0%, #3d2812 100%);
      color: #fae7bd;
      border: 1px solid #b88a44;
      border-radius: 4px;
      padding: 6px 14px;
      font-size: 13px;
      cursor: pointer;
      min-height: 32px;
    }
  `;
  document.head.appendChild(style);
}

export class MobileControlsHelp {
  readonly root: HTMLElement;
  private openState = false;
  private readonly opts: MobileControlsHelpOptions;

  constructor(opts: MobileControlsHelpOptions = {}) {
    this.opts = opts;
    if (typeof document === 'undefined') {
      this.root = {} as HTMLElement;
      return;
    }

    ensureStyles();
    this.root = document.createElement('div');
    this.root.className = 'tv-mhelp-backdrop';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Touch Controls Guide');

    this.root.innerHTML = `
      <div class="tv-mhelp-card">
        <div class="tv-mhelp-head">
          <h2 class="tv-mhelp-title">Touch & Mobile Controls</h2>
          <button type="button" class="tv-mhelp-btn" data-action="close" aria-label="Close touch controls">Close</button>
        </div>
        <p class="tv-mhelp-sub">Use touch gestures or the virtual stick to command your party in real time.</p>
        <div class="tv-mhelp-grid">
          ${GESTURE_GUIDE_ITEMS.map(
            (item) => `
            <article class="tv-mhelp-item" data-gesture="${item.id}">
              <div class="tv-mhelp-item-head">
                <span class="tv-mhelp-icon" aria-hidden="true">${item.icon}</span>
                <span>${item.title}</span>
              </div>
              <div class="tv-mhelp-gesture">${item.gesture}</div>
              <p class="tv-mhelp-desc">${item.action}</p>
            </article>`,
          ).join('')}
        </div>
        <div class="tv-mhelp-foot">
          <button type="button" class="tv-mhelp-btn" data-action="close">Got It</button>
        </div>
      </div>
    `;

    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
    this.root.querySelectorAll('button[data-action="close"]').forEach((btn) => {
      btn.addEventListener('click', () => this.close());
    });

    (opts.parent ?? document.body).appendChild(this.root);
  }

  isOpen(): boolean {
    return this.openState;
  }

  open(): void {
    this.openState = true;
    this.root.hidden = false;
  }

  close(): void {
    this.openState = false;
    this.root.hidden = true;
    this.opts.onClose?.();
  }

  toggle(): void {
    if (this.openState) this.close();
    else this.open();
  }

  destroy(): void {
    this.root.remove?.();
  }
}
