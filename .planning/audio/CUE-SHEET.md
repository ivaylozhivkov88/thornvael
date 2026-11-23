# Thornvael Audio Cue Sheet (Acts I & II)

**Target Format:** AAC-LC `.m4a` (`44.1 kHz`, stereo music streamed via `<audio>`, mono/stereo short SFX decoded into Web Audio buses with voice limiting).

---

## 1. Act I & Act II Music Cues

| Cue ID | Title / Scene | Mood & Instrumentation | Tempo | Length | Loop Points (`start -> end`) | Trigger |
|---|---|---|---:|---:|---|---|
| `mus-menu-ash` | Title & Campfire | Somber frontier lute, low hurdy-gurdy drone, distant ember crackle | 72 BPM | `02:24` | `00:08.00 -> 02:16.00` | Main menu / Hero select |
| `mus-town-thornwick` | Thornwick Hearth | Warm acoustic mandolin, hammered dulcimer, soft hearth percussion | 84 BPM | `02:40` | `00:04.00 -> 02:36.00` | Entering `town-thornwick` |
| `mus-act1-march` | Border Roads & Ford | Brisk frame drum, bowed tagelharpa, muted brass horn swells | 104 BPM | `03:00` | `00:06.00 -> 02:54.00` | Act I exploration (`m01`–`m06`) |
| `mus-act1-skirmish` | Ford Ambush | Driving war drums, pizzicato low strings, sharp iron clatter | 128 BPM | `02:10` | `00:02.00 -> 02:08.00` | Act I combat intensity >= 0.6 |
| `mus-act1-ashbrook` | Ashbrook Siege | Heavy orchestral brass, anvil hits, tense minor choir pad | 118 BPM | `02:48` | `00:04.00 -> 02:44.00` | `m09`–`m11` / Morvessa boss |
| `mus-town-redmarsh` | Redmarsh Stilt-Outpost | Dry oud, hollow clay darabuka, desert wind flute | 78 BPM | `02:32` | `00:04.00 -> 02:28.00` | Entering `town-redmarsh` / `town-brinewell` |
| `mus-act2-alkali` | Alkali Salt-Pans | Sparse bowed cello harmonics, glass marimba, arid shaker | 92 BPM | `03:05` | `00:05.00 -> 03:00.00` | Act II exploration (`z2-ochre-ditch`..`z2-quartz-plateau`) |
| `mus-act2-saltvaults` | Third-Dynasty Tombs | Deep bone-flute, bronze bell tolls, resonant stone drone | 68 BPM | `02:50` | `00:04.00 -> 02:46.00` | `z2-salt-vaults` / Khepri encounter |
| `mus-act2-ironheart` | Ironheart Bastion | Industrial anvilostinato, low brass blasts, pounding war-toms | 132 BPM | `02:36` | `00:02.50 -> 02:33.50` | `z2-ironheart-bastion` / Gorrathul |
| `mus-victory-fanfare` | Mission Cleared | Triumphant horn fifth, snare roll, warm string resolve | 112 BPM | `00:14` | One-shot (no loop) | Mission victory state |
| `mus-defeat-dirge` | Company Fallen | Descending solo cello, muffled bell toll | 60 BPM | `00:12` | One-shot (no loop) | Mission defeat state |

---

## 2. SFX Master List & Layering Rules (`80` Prompts in `.planning/audio/sfx_prompts.json`)

| Category | Key Prefix | Trigger | Duration | Layering / Voice Limit |
|---|---|---|---:|---|
| Melee & Weapons | `sfx-wpn-*` (14) | Swing, steel clash, mace crush, bow release, crossbow twang | `0.15s–0.45s` | Max 4 concurrent; pitch jitter `±6%` |
| Hit & Armor Impacts | `sfx-hit-*` (10) | Flesh hit, plate clang, shield block, crit crunch, bleed tick | `0.12s–0.40s` | Layered with weapon whoosh; duck `-3 dB` on swarm |
| Spells & Magic | `sfx-spl-*` (16) | Fireball cast/boom, lightning crack, frost shard, heal chime, curse | `0.30s–1.10s` | Max 3 per school; spatial pan by screen X |
| Monsters & Bosses | `sfx-mon-*` (16) | Hound snarl, ghoul rasp, flintback slam, gnoll horn, boss phase roar | `0.25s–1.20s` | Cooldown `1.5s` per family to prevent bark spam |
| UI & Inventory | `sfx-ui-*` (12) | Button click, gold clink, equip plate, potion cork, quest chime, level-up | `0.08s–0.90s` | Unpanned `ui` bus; bypasses spatial attenuation |
| Ambience & World | `sfx-amb-*` (12) | River ford, alkali wind, forge hammer, tavern murmur, shrine hum, crate smash | `0.30s–2.50s` | Low-volume bed (`-14 dB`) with gentle LPF |
