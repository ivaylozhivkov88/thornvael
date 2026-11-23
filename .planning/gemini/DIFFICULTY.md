# Difficulty Curve Proposal & Headless TTK Comparison

**Data Source:** `src/data/difficulty-curve.json`  
**Sim Alignment:** `src/sim/difficulty.ts` (`RULES[0]` = Easy, `RULES[1]` = Medium/Normal, `RULES[2]` = Hard)  
**Test Suite:** `tests/difficulty-ttk.test.ts` (20 Hz fixed-timestep headless TTK simulator)

## 1. Proposed Multipliers

| Difficulty | Index | Enemy HP | Enemy Damage | XP Mult | Gold Mult | Drop Rate Mult | Sim Rule Highlights (`src/sim/difficulty.ts`) |
|---|---:|---:|---:|---:|---:|---:|---|
| Easy (Border Levy) | 0 | `0.75x` | `0.80x` | `1.15x` | `1.25x` | `1.00x` | `foeHitPct=80`, `friendlyPct=0`, `goldPct=150`, `aggro=8` |
| Normal (Vanguard Standard) | 1 | `1.00x` | `1.00x` | `1.00x` | `1.00x` | `1.00x` | `foeHitPct=100`, `friendlyPct=0`, `goldPct=100`, `aggro=11` |
| Hard (Iron Discipline) | 2 | `1.35x` | `1.25x` | `1.25x` | `1.15x` | `1.25x` | `foeHitPct=100`, `friendlyPct=25`, `mercPct=125`, `hunt=true`, `aggro=14` |

## 2. Simulated Time-to-Kill (TTK) per Zone (`20 Hz` Headless Sim)

| Zone | Base HP | Base Armor | Hero DPS | Easy TTK | Normal TTK | Hard TTK |
|---|---:|---:|---:|---:|---:|---:|
| Act 1: Thornwick & Sunken Ford | 65 | 2 | 18 | `2.95s` | `3.90s` | `5.30s` |
| Act 2: Redmarsh & Salt-Vaults | 165 | 5 | 36 | `3.80s` | `5.05s` | `6.85s` |
| Act 3: Burning Harbor & Rampart | 320 | 9 | 58 | `4.65s` | `6.15s` | `8.30s` |
| Act 4: Ember Threshold & Caldera | 540 | 14 | 82 | `5.60s` | `7.45s` | `10.05s` |

## 3. Design Notes
- **Easy** trims TTK by ~25% and increases starting gold (`150%`) + XP (`1.15x`) so casual players can experiment with mercenaries without grinding.
- **Hard** avoids spongey 20-second trash fights (`1.35x` HP -> `5.30s–10.05s` TTK) while leaning on `hunt=true`, `aggroTiles=14`, `friendlyPct=25`, and `1.25x` enemy damage to reward formation discipline and compensate with `1.25x` XP & drop rates.
