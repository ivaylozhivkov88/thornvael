# Loot Tables Audit (`100,000` Simulated Drops per Zone)

**Method:** Deterministic `Rng` (`seed = 1000 + zoneIndex`), `calculateNoDropRate(..., diff = 1)`, `rollLoot`, and `evaluateQualityHierarchy(..., mf = 25, diff = 1)` across `100,000` normal-rank kills per zone tier (`tests/loot-audit.test.ts`).

## 1. Table Integrity Check
- Audited all `LOOT_RULES` entries in `src/sim/items.ts`:
  - Drop chances are within `0..100`.
  - Item tier bounds satisfy `1 <= lo <= hi <= 5`.
  - No clearly broken tables were found; no code edits to `LOOT_RULES` were required.

## 2. Simulated Rates (`N = 100,000` per Zone, Normal Difficulty, `25% MF`)

| Zone Tier | Kills/hr | No-Drop % | Normal % | Magic % | Rare % | Set % | Unique % | Est. Gold/hr |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Act 1: Thornwick & Sunken Ford (`T1–2`) | 240 | 65.20% | 15.60% | 11.00% | 4.77% | 2.264% | 1.161% | 1,756 |
| Act 2: Redmarsh & Salt-Vaults (`T2–3`) | 210 | 58.08% | 19.04% | 12.90% | 5.89% | 2.658% | 1.428% | 3,330 |
| Act 3: Burning Harbor & Rampart (`T3–4`) | 180 | 51.68% | 21.82% | 15.12% | 6.67% | 3.102% | 1.610% | 4,440 |
| Act 4: Ember Threshold & Caldera (`T4–5`) | 150 | 44.87% | 24.68% | 17.44% | 7.63% | 3.460% | 1.918% | 5,199 |

## 3. Observations
- **Monotonic Progression:** Gold/hr scales cleanly from `1,756` (Act 1) to `5,199` (Act 4), supporting steadily rising mercenary hire and repair costs without hyperinflation.
- **Rarity Ordering:** In every zone, `normal > magic > rare > set > unique`, with unique drop rates staying in the `1.16%–1.92%` band at 25% MF.
