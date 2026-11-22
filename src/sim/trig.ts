/**
 * Deterministic 4096-entry sine/cosine lookup table for simulation math.
 * Eliminates cross-engine libm float discrepancies in deterministic sim paths.
 */

export const LUT_SIZE = 4096;
export const LUT_MASK = LUT_SIZE - 1;
const LUT_QUARTER = LUT_SIZE >>> 2;
const TAU = Math.PI * 2;
const RAD_TO_LUT = LUT_SIZE / TAU;

export const SIN_LUT: Float64Array = (() => {
  const lut = new Float64Array(LUT_SIZE);
  for (let i = 0; i < LUT_SIZE; i++) {
    lut[i] = Math.sin((i * TAU) / LUT_SIZE);
  }
  // Pin exact cardinal values to avoid IEEE-754 near-zero drift (e.g. 1.2246e-16).
  lut[0] = 0;
  lut[LUT_QUARTER] = 1;
  lut[LUT_QUARTER * 2] = 0;
  lut[LUT_QUARTER * 3] = -1;
  return lut;
})();

/** Deterministic fast sine via 4096-entry LUT. */
export function sinLut(rad: number): number {
  const idx = Math.round(rad * RAD_TO_LUT) & LUT_MASK;
  return SIN_LUT[idx];
}

/** Deterministic fast cosine via 4096-entry LUT (sin phase-shifted by pi/2). */
export function cosLut(rad: number): number {
  const idx = (Math.round(rad * RAD_TO_LUT) + LUT_QUARTER) & LUT_MASK;
  return SIN_LUT[idx];
}
