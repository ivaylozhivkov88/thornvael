# Audio workshop — private audition batch, 2026-11-04

These are original synthesized drafts **APPROVED-AS-AUDITION-CANDIDATES** after independent technical review, not accepted runtime assets or natural recordings. The review verified all 35 WAV/AAC candidate hashes, the generator source hash, and ffprobe data for three AAC files, and found no critical blocker to private audition. The source, PCM masters, AAC candidates, scores, cue sheets and measurements live in `.planning/audio-workshop/`. Nothing under `src/audio*`, `public/audio/`, `assets.json`, the existing generator, or shared runtime audio is changed by this workshop.

From the checkout root, using the installed Python/numpy and FFmpeg/ffprobe:

```powershell
python game/tools/audio-workshop.py --sfx
python game/tools/audio-workshop.py --music
python game/tools/audio-workshop.py --verify
```

Only this generator and this document are new files in `game/`. Every generated file stays below `.planning/audio-workshop/`. A render command regenerates its owned candidates there. No downloads, paid APIs, external agents, soundfonts, or foreign recordings are used.

## Start with the SFX

- `previews/sfx-first-audition-10s.wav`: compact first audition, also AAC `.m4a`.
- `previews/sfx-materials-and-magic-18s.wav`: broader material sequence, also AAC.
- `previews/sfx-cue-sheet.json`: exact montage onset and candidate ID.
- `source-wav/sfx/iron_rebuff_01.wav`: modal sword impact; three variants.
- `source-wav/sfx/flint_path_01.wav`: layered gravel step; three variants.
- `source-wav/sfx/meadow_tread_01.wav`: softer grass step; three variants.
- `source-wav/sfx/oak_guard_01.wav`: wood body plus metal rim; two variants.
- `source-wav/sfx/yew_release_01.wav`: plucked tension release; two variants.
- `source-wav/sfx/rill_crown_01.wav`: water-school rising droplets.

There are 31 SFX, 65–1200 ms long, covering gravel, grass, armor, sword/shield, bow, miss, wood/metal/cloth, gold/UI/bag, five spell schools, buff, heal and nonvocal death. Material voices combine smooth-band filtered excitation, damped nonharmonic modes, staggered micro-impacts and short edge envelopes. Per-ID SHA-derived seeds make variant generation independent of render order. Category RMS aims keep footsteps/UI quieter; gain is capped by peak headroom with no hard-clip rescue.

## Music studies

| ID | Mood | Length | Tempo | Main idea |
|---|---|---:|---:|---|
| `lanterns_beyond_the_ford` | Exploration | 42.667 s | 90 | Dorian-flavored flute phrases, broad strings, sparse plucks and mallet answers |
| `copper_roofs_at_market` | Town | 38.400 s | 100 | Major-key mallet theme, answering flute, pizzicato and light hand percussion |
| `reeds_before_the_watchfire` | Tension | 40.000 s | 96 | Phrygian-flavored semitone theme, low strings, restrained horn and sparse drum |
| `standard_at_stonebridge` | Battle | 34.286 s | 112 | Minor-key horn calls, moving string/pluck accompaniment, flute answers and frame drums |

Each full study is 16 bars in 4/4, with four authored phrases, a separate harmonic progression, bass, inner parts, countermelody, phrase-level dynamics and seeded timing/velocity variation. Timbres are additive/modal synthetic approximations, not sampled orchestral instruments. Stereo placement and a short damped room are restrained. The parent may judge them too synthetic; musical and timbral acceptance remains open.

Full tracks: `source-wav/music/<id>.wav` and `candidates-aac/music/<id>.m4a`. Quick first-theme excerpt: `previews/first-theme-lanterns-12s.wav`. Original note-event scores and all timing/pan/voice seeds are in `scores/<id>.json`.

## Loop and codec contract

Full PCM tracks use sample-periodic note scheduling and wrapped note/reverb tails. There is no artificial fade to silence each cycle. Phase-compatible tails overlap at their original positions within the first bar; the method is circular overlap-add rather than an arbitrary-phase waveform crossfade. The first-theme excerpt alone has presentation fades.

The exclusive PCM `loopEndFrame` in the catalog is authoritative for the intended musical period. AAC encoding has 1024-sample priming and frame padding; `technical-report.json` captures actual packet skip/edit metadata and decoded sample counts. Check all three two-second seam previews (the seam is at one second): `*-pcm-seam.wav`, `*-aac-full-seam.wav`, and `*-aac-valid-window-seam.wav`. FFmpeg's decoded result is not proof that browser media-element looping is gapless. Real browser/iOS looping is **untested**.

Current codec findings: the battle decode includes 878 extra frames (18.29 ms); town has a -32.63 dBFS join (roughly 1.49× its internal derivative p99). Conservative AAC review flags apply to town, tension and battle. All four PCM joins are below their internal derivative p99, but this is only a numerical result. Review the seam previews before selecting any compressed loop.

## Provenance, measurements and next decision

`catalog.json` holds meaningful IDs, proposed event mappings, seed, WAV/AAC SHA-256 and measurements. `provenance.json` records generator/tool versions and reference status. `technical-report.md` summarizes the full JSON report: durations, rates, RMS, 4× oversampled peak estimates, silence, clipping, deterministic regeneration, PCM/AAC seam derivative and boundary RMS.

The supplied Tzar/Anno references are a mood brief, not source material. The [official Dynamedion portfolio](https://dynamedion.com/portfolio/anno-1404/) describes its Anno 1404 work. Its page was read; none of the reference recordings was played or analyzed. Supplied YouTube page fetches failed. No melodies or recordings were imported. The user identified the final Tzar link as a fan orchestration, not an original soundtrack source.

Human audition and selection are still required before runtime integration. The independent review was a technical integrity check, not perceptual approval: it does not establish that the sounds are pleasing, clear in-game, fatigue-safe or faithful to any reference. The catalog includes future surface/material/armor/item cues that existing runtime event mapping cannot yet select; no new runtime capability is claimed. Keep short SFX decoded per mission and music streamed through the existing media-element architecture. Any accepted replacement requires a separately authorized runtime/manifest change, mobile listening and real-browser loop testing. Browser/iOS looping remains untested; town/tension/battle retain AAC edge flags and battle decodes 878 extra frames. This batch makes no production-quality, live-orchestra or reference-fidelity claim.
