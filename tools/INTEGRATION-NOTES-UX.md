# UX & Atmosphere Integration Notes (`src/ui-extra/` & `src/atmosphere.ts`)

These modules are self-contained and ready to wire into `src/shell.ts`, `src/minimap.ts`, and `src/main.ts` once area locks are lifted.

## 1. Biome Atmosphere (`src/atmosphere.ts`)

- Already hooked into `src/render.ts` via the single call inside `Renderer.draw()`:
  ```ts
  updateAtmosphere(this.app?.stage, this.aestheticVfx?.getBiome?.() ?? 'swamp', dtMs, this.camX, this.camY, this.zoom, this.viewW, this.viewH, this.quality);
  ```
- Automatically disables on `quality <= 0`, low-end device profiles (`hardwareConcurrency <= 2` or `deviceMemory <= 2`), or `reducedMotion: true` (`localStorage['thornvael.reducedMotion']` / `prefers-reduced-motion: reduce`).
- If you want to bind the map's explicit biome name directly from `main.ts`, pass it to `renderer.setBiome(biome)` so `aestheticVfx.getBiome()` and `updateAtmosphere()` stay synchronized.

## 2. Settings & Accessibility Panel (`src/ui-extra/settings-panel.ts`)

Wire into `src/shell.ts` (and/or the in-game pause menu):

```ts
import { SettingsPanel, applyUxSettings, loadUxSettings } from './ui-extra/settings-panel';

// On app boot (applies saved text scale, reducedMotion, colorblind badges):
applyUxSettings(loadUxSettings());

const settingsPanel = new SettingsPanel({
  onQualityChange: (qualityLevel) => {
    renderer?.setQuality(qualityLevel);
  },
  onReducedMotionChange: (reduced) => {
    // AtmosphereSystem updates automatically via setAtmosphereReducedMotion()
    // Optional: forward to CombatFeelSystem / VfxSystem if desired
    void reduced;
  },
});

// Connect to a "Settings" button in shell.ts or HUD:
settingsButton.addEventListener('click', () => settingsPanel.open());
```

### Colorblind Rarity Badges Helper

Wherever item tooltips or loot labels render rarity (`common | magic | rare | set | unique`), use:

```ts
import { getRarityBadge } from './ui-extra/settings-panel';

const showSymbols = document.documentElement.dataset.colorblindBadges === 'true';
const badge = getRarityBadge('rare', showSymbols);
// -> { symbol: '◆', label: 'Rare', shortTag: '[R]', color: '#f3d15c' }
```

## 3. Touch & Mobile Controls Guide (`src/ui-extra/mobile-controls-help.ts`)

Wire into `src/shell.ts` or the mobile HUD help button:

```ts
import { MobileControlsHelp } from './ui-extra/mobile-controls-help';

const mobileHelp = new MobileControlsHelp();
helpButton.addEventListener('click', () => mobileHelp.open());
```

- Uses `height: 100dvh; max-height: 100dvh; overflow: hidden;` and responsive `clamp(...)` sizing so all 5 gesture cards (Tap, Long-Press, Drag-Box, 2-Finger Pan & Pinch, Virtual Stick) fit without vertical scrolling on 1080p, 720p, and mobile landscape.

## 4. Minimap Tactical Pings (`src/ui-extra/minimap-pings.ts`)

Wire into `src/minimap.ts` or `src/main.ts`:

```ts
import { MinimapPingQueue, drawMinimapPings } from './ui-extra/minimap-pings';

const minimapPings = new MinimapPingQueue({ maxPings: 12, defaultDurationMs: 3000 });

// Trigger a ping on quest/raid/player signal:
minimapPings.push(tileX, tileY, 'attack', performance.now(), 'Ambush');

// At the end of Minimap.draw():
drawMinimapPings(this.ctx, minimapPings, this.scale, performance.now());
```
