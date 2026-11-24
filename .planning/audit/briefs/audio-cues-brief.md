# Brief: Synthesize Missing Audio Cues (`dog_bark` & `amb_town_ironcamp`)

- **Target Files:**
  - `public/audio/amb_town_ironcamp.m4a` (volcanic ash wind & distant citadel anvil/horn ambience for Highcrest Citadel `src/missions/highcrest-citadel.map.json`)
  - `public/audio/dog_bark.m4a` (short town/hound bark cue for Thornwick ambience)
- **Format:** AAC-LC `.m4a` via FFmpeg (`64–96 kbps` SFX/ambience), `<= 2 MB`.
- **Wiring & Provenance:** Register both in `public/data/audio-manifest.json`, `assets.json` (`license: "own"`), and update `src/missions/highcrest-citadel.map.json` `regions[0].ambience` from `amb_town_oakhaven` to `amb_town_ironcamp`.
