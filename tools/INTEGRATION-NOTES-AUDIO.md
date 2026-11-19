# Audio Wave 2 & Live Integration Notes (Thornvael)

All Wave 2 audio cues (`public/audio/*.m4a`) are generated reproducibly by `tools/audio-gen-wave2.py`, registered in `assets.json` (`license: "own"`), cataloged in `src/audio-catalog.ts`, orchestrated by `AdaptiveAudioDirector` (`src/audio-adaptive.ts`), and **live-wired inside `src/audio.ts`** without calling `decodeAudioData()` on any music track.

---

## 1. Live Engine Architecture (`src/audio.ts` + `src/audio-adaptive.ts`)

- **Streaming Music (`<audio>` via `AdaptiveAudioDirector`)**:
  - `src/audio.ts` constructs a live `AdaptiveAudioDirector` with a `createLiveTrackHandle` factory backed by `HTMLAudioElement` (`new Audio(url)`), routed through `MediaElementAudioSourceNode -> per-track GainNode -> musicBus` (for iOS Safari hardware volume compatibility) and falling back to `el.volume` if Web Audio routing throws.
  - Music files NEVER pass through `fetch()` or `decodeAudioData()`.
  - Wave 2 SFX (`bark_*`, `bark_merc_*`, `mon_hit_*`, `boss_roar_*`) and extra Wave 1 catalog SFX (`ui_error`, `step_snow_*`, `step_ash_*`, `mon_aggro_*`, `death_*_1`) are lazy-decoded on first play (or via `preloadAudioCues()`) so initial boot `unlock()` remains fast (109 core SFX + 1 ambience bed).
- **Available High-Level Music & Ducking APIs in `src/audio.ts`**:
  - `setMusicRegion(act, mode, regionIndex)` — crossfades to act/region exploration, battle, or town themes (`getMusicForAct`).
  - `setSkirmishMusic(biome)` — streams skirmish biome theme (`music_skirmish_{forest,marsh,desert,crypt,volcanic}`).
  - `setCharSelectMusic()` / `setMainMenuMusic()` — streams `music_char_select` / `music_main_menu`.
  - `playBossMusic(bossId, phase = 1, roarDurationMs = 2200)` — triggers boss roar stinger (`boss_roar_*`) with automatic music ducking (`0.25x`) and crossfades to `music_boss_*` (including `music_boss_ashkarath_phase2`).
  - `playEndingMusic(ending: 'crown' | 'ember' | 'a' | 'b')` — streams Map 4 Ending A (`music_ending_crown`) or Ending B (`music_ending_ember`).
  - `updateAdaptiveCombat(enemyInView, nowMs)` — hysteresis-guarded explore <-> battle crossfades (`6s` cooldown).
  - `setDialogueDucking(active)` / `setMusicDucking(reason, active)` — ducks `musicBus` cleanly during NPC conversations (`0.35x`), cutscenes (`0.35x`), or boss roars (`0.25x`).
- **New D4 Dark-Fantasy Voice & Hit Cues in `src/audio.ts`**:
  - `playNpcBark(role, duckMs = 0, at?)` — plays `bark_{smith,innkeeper,mage,priest,guard,merchant}` on `uiBus` (also wired automatically into `playTraderBark(..., 'greet')`).
  - `playMercBark(archetype, at?)` — plays `bark_merc_{warrior,archer,mage}` spatially on `sfxBus`.
  - `playMonsterHitVoice(family, at?)` — plays `mon_hit_{beast,undead,caster,construct,insect}` spatially on `sfxBus`.
  - `playMonsterAggroVoice(family, at?)` / `playMonsterDeathVoice(family, at?)` — plays per-family aggro/death voices.
  - `playBossRoar(bossId, duckMs = 2200, at?)` — plays `boss_roar_{morvessa,gorrathul,vesperion,ashkarath}` with temporary `boss_roar` ducking.
  - `playUiError()` — plays `ui_error` on `uiBus`.

---

## 2. Bus Volume Sliders & `muteOnBlur` UI Hook (`src/shell.ts` / `src/pausemenu.ts` / `src/ui-extra/settings-panel.ts`)

`src/audio.ts` now exposes both per-bus accessors (`get/setMusicVolume`, `get/setSfxVolume`, `get/setAmbienceVolume`, `get/setUiVolume`) and unified bus slider helpers (`setBusVolume(bus, v)`, `getBusVolume(bus)`, `getBusVolumes()`) backed by `localStorage` (`thornvael.musicVol`, `thornvael.sfxVol`, `thornvael.ambVol`, `thornvael.uiVol`, `thornvael.muteOnBlur`).

### Suggested Slider & Toggle Hook for `src/shell.ts` (and `src/pausemenu.ts`):

```ts
import {
  getBusVolumes,
  setBusVolume,
  isMuteOnBlur,
  setMuteOnBlur,
  setCharSelectMusic,
  setMainMenuMusic,
  type AudioBus,
} from './audio';

// 1. Bind all 4 bus sliders (music, sfx, ambient, ui):
const BUS_LABELS: Array<{ bus: AudioBus; label: string }> = [
  { bus: 'music', label: 'Music' },
  { bus: 'sfx', label: 'Combat SFX' },
  { bus: 'ambient', label: 'Ambience' },
  { bus: 'ui', label: 'UI & Barks' },
];

const vols = getBusVolumes();
for (const { bus, label } of BUS_LABELS) {
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '100';
  input.value = String(Math.round(vols[bus] * 100));
  input.setAttribute('aria-label', `${label} Volume`);
  input.addEventListener('input', () => {
    setBusVolume(bus, Number(input.value) / 100);
  });
}

// 2. Bind "Mute When Tab / App Unfocused" checkbox:
const blurToggle = document.createElement('input');
blurToggle.type = 'checkbox';
blurToggle.checked = isMuteOnBlur();
blurToggle.addEventListener('change', () => {
  setMuteOnBlur(blurToggle.checked);
});

// 3. Shell screen music transitions:
// - Main menu:       setMainMenuMusic();
// - Hero selection:  setCharSelectMusic();
```

### Suggested Gameplay Hooks for `src/main.ts` & `src/missionui.ts` (once locks lift):

```ts
// In src/missionui.ts showDialogue() / close():
setDialogueDucking(true);
// Optional speaker bark:
playNpcBark(speakerName, 1400);
// On dialogue close:
setDialogueDucking(false);

// In src/main.ts finish('win'):
if (missionName === 'map4-obsidian-caldera') {
  playEndingMusic(endingChoice); // 'crown' (Ending A) or 'ember' (Ending B)
}

// In src/main.ts boss reveal:
playBossMusic(bossArt, bossPhase);
```
