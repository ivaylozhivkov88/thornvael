import { Graphics } from 'pixi.js';
import type { Sim } from './sim/sim';
import {
  AuraId,
  getAuraDefinition,
  getUnitActiveAuras,
  isUnitUnderConviction,
} from './sim/auras';
import { getSuperUniqueForUnit } from './sim/super-uniques';
import { FP } from './sim/sim';

/**
 * Vanguard Aura Visual Engine for Thornvael
 *
 * Ground decal projection directly under feet with blendMode = 'add' (soft additive glow).
 * Multi-layer animation architecture:
 * Layer A: Soft elliptical ambient base glow with subtle radial falloff.
 * Layer B: Distinct rotating geometric / runic pattern ring (smooth trigonometric rendering with glyph accents & serrated teeth).
 * Layer C: Particle accents: orbiting motes, flame sparks, ice crystals, lightning zaps, floating runes, healing glimmers, chevrons, wisps.
 * Layer D: 2-second outward pulsing shockwave ripple that expands and fades smoothly.
 */

// Aspect ratio for 2D orthogonal ground plane projection: ry / rx ~= 0.47
const ASPECT = 0.47;

export function renderVanguardAura(
  g: Graphics,
  auraId: AuraId,
  ux: number,
  uy: number,
  now: number,
  scale: number = 1.0,
  seed: number = 0
): void {
  const def = getAuraDefinition(auraId);
  if (!def) return;

  const baseR = 19 * scale;
  const rx = baseR;
  const ry = baseR * ASPECT;
  const cy = uy + 2;

  // ================= LAYER A: Soft Elliptical Base Glow =================
  g.ellipse(ux, cy, rx * 1.25, ry * 1.25).stroke({
    color: def.secondaryColor,
    width: 2.2,
    alpha: 0.12,
  });
  g.ellipse(ux, cy, rx, ry).stroke({
    color: def.primaryColor,
    width: 1.4,
    alpha: 0.24,
  });
  g.ellipse(ux, cy, rx * 0.65, ry * 0.65).stroke({
    color: def.accentColor,
    width: 0.9,
    alpha: 0.16,
  });

  // ================= LAYER B & C: Distinct Aura Geometry & Particles =================
  switch (auraId) {
    case 'might':
      drawMightAura(g, ux, cy, now, rx, ry, seed, def);
      break;
    case 'holy_fire':
      drawHolyFireAura(g, ux, cy, now, rx, ry, seed, def);
      break;
    case 'thorns':
      drawThornsAura(g, ux, cy, now, rx, ry, seed, def);
      break;
    case 'blessed_aim':
      drawBlessedAimAura(g, ux, cy, now, rx, ry, seed, def);
      break;
    case 'holy_freeze':
      drawHolyFreezeAura(g, ux, cy, now, rx, ry, seed, def);
      break;
    case 'holy_shock':
      drawHolyShockAura(g, ux, cy, now, rx, ry, seed, def);
      break;
    case 'sanctuary':
      drawSanctuaryAura(g, ux, cy, now, rx, ry, seed, def);
      break;
    case 'fanaticism':
      drawFanaticismAura(g, ux, cy, now, rx, ry, seed, def);
      break;
    case 'conviction':
      drawConvictionAura(g, ux, cy, now, rx, ry, seed, def);
      break;
    case 'prayer':
      drawPrayerAura(g, ux, cy, now, rx, ry, seed, def);
      break;
    case 'defiance':
      drawDefianceAura(g, ux, cy, now, rx, ry, seed, def);
      break;
    case 'cleansing':
      drawCleansingAura(g, ux, cy, now, rx, ry, seed, def);
      break;
    case 'vigor':
      drawVigorAura(g, ux, cy, now, rx, ry, seed, def);
      break;
    case 'meditation':
      drawMeditationAura(g, ux, cy, now, rx, ry, seed, def);
      break;
    case 'redemption':
      drawRedemptionAura(g, ux, cy, now, rx, ry, seed, def);
      break;
    case 'salvation':
      drawSalvationAura(g, ux, cy, now, rx, ry, seed, def);
      break;
    case 'concentration':
      drawConcentrationAura(g, ux, cy, now, rx, ry, seed, def);
      break;
  }

  // ================= LAYER D: 2-Second Outward Pulsing Shockwave Ripple =================
  // Period = 2000 ms (0.0005 multiplier)
  const ripplePhase = (now * 0.0005 + seed * 0.27) % 1;
  const rwX = rx * (0.35 + ripplePhase * 1.15);
  const rwY = ry * (0.35 + ripplePhase * 1.15);
  const rippleAlpha = Math.sin(ripplePhase * Math.PI) * 0.36;
  g.ellipse(ux, cy, rwX, rwY).stroke({
    color: def.primaryColor,
    width: 1.3,
    alpha: rippleAlpha,
  });
  g.ellipse(ux, cy, rwX * 0.88, rwY * 0.88).stroke({
    color: def.accentColor,
    width: 0.8,
    alpha: rippleAlpha * 0.55,
  });
}

// ----------------------------------------------------------------------------------
// 1. Might: Soft pulsing amber/orange ring with radiating mini-spikes along the rim
// ----------------------------------------------------------------------------------
function drawMightAura(
  g: Graphics,
  ux: number,
  cy: number,
  now: number,
  rx: number,
  ry: number,
  seed: number,
  def: ReturnType<typeof getAuraDefinition>
): void {
  const pulse = 1 + 0.04 * Math.sin(now * 0.0025 + seed);
  const prx = rx * pulse;
  const pry = ry * pulse;
  const rot = now * 0.0006 + seed;

  // Glowing ring
  g.ellipse(ux, cy, prx, pry).stroke({ color: def.primaryColor, width: 1.5, alpha: 0.32 });

  // 12 radiating mini-spikes along perimeter
  const spikeCount = 12;
  for (let s = 0; s < spikeCount; s++) {
    const ang = rot + (s * Math.PI * 2) / spikeCount;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const inX = ux + cos * (prx * 0.92);
    const inY = cy + sin * (pry * 0.92);
    const outX = ux + cos * (prx * 1.22);
    const outY = cy + sin * (pry * 1.22);
    g.moveTo(inX, inY).lineTo(outX, outY).stroke({ color: def.accentColor, width: 1.1, alpha: 0.38 });
  }

  // Radiating mini-motes
  for (let m = 0; m < 3; m++) {
    const phase = (now * 0.0007 + m * 0.33 + seed * 0.1) % 1;
    const mAng = m * 2.09 + now * 0.0008;
    const mrx = prx * (0.5 + phase * 0.5);
    const mry = pry * (0.5 + phase * 0.5);
    const mx = ux + Math.cos(mAng) * mrx;
    const my = cy + Math.sin(mAng) * mry;
    g.circle(mx, my, 0.9).fill({ color: def.accentColor, alpha: (1 - phase) * 0.45 });
  }
}

// ----------------------------------------------------------------------------------
// 2. Holy Fire: Blazing orange-crimson ground ring with rising flame tongues & embers
// ----------------------------------------------------------------------------------
function drawHolyFireAura(
  g: Graphics,
  ux: number,
  cy: number,
  now: number,
  rx: number,
  ry: number,
  seed: number,
  def: ReturnType<typeof getAuraDefinition>
): void {
  const rot = now * 0.0007;

  // Dual flame ground circles
  g.ellipse(ux, cy, rx * 1.1, ry * 1.1).stroke({ color: def.primaryColor, width: 1.8, alpha: 0.28 });
  g.ellipse(ux, cy, rx * 0.75, ry * 0.75).stroke({ color: def.secondaryColor, width: 1.2, alpha: 0.35 });

  // 8 rising flame tongues licking upward around the rim
  const tongueCount = 8;
  for (let t = 0; t < tongueCount; t++) {
    const ang = rot + (t * Math.PI * 2) / tongueCount;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const bx = ux + cos * rx;
    const by = cy + sin * ry;
    const flickerH = 4.5 + 3.0 * Math.sin(now * 0.015 + t * 1.8);
    const sway = Math.sin(now * 0.009 + t) * 1.4;
    const tipX = bx + sway;
    const tipY = by - flickerH;

    // Tapered flame tongue stroke
    g.moveTo(bx - 1.2, by).lineTo(tipX, tipY).lineTo(bx + 1.2, by).fill({
      color: def.accentColor,
      alpha: 0.45,
    });
  }

  // Rising embers floating upward and fading
  for (let m = 0; m < 4; m++) {
    const phase = (now * 0.0009 + m * 0.25 + seed * 0.15) % 1;
    const mAng = m * 1.57 + now * 0.0006;
    const mrx = rx * (0.4 + phase * 0.6);
    const mry = ry * (0.4 + phase * 0.6);
    const mx = ux + Math.cos(mAng) * mrx;
    const my = cy + Math.sin(mAng) * mry - phase * 7;
    g.circle(mx, my, 0.85).fill({ color: def.accentColor, alpha: (1 - phase) * 0.5 });
  }
}

// ----------------------------------------------------------------------------------
// 3. Thorns: Sharp jagged blood-red spikes pointing outward around feet
// ----------------------------------------------------------------------------------
function drawThornsAura(
  g: Graphics,
  ux: number,
  cy: number,
  now: number,
  rx: number,
  ry: number,
  seed: number,
  def: ReturnType<typeof getAuraDefinition>
): void {
  const rot = now * 0.0003 + seed;
  const pulse = 1 + 0.05 * Math.sin(now * 0.003 + seed);
  const prx = rx * pulse;
  const pry = ry * pulse;

  // Base blood ring
  g.ellipse(ux, cy, prx, pry).stroke({ color: def.secondaryColor, width: 1.6, alpha: 0.35 });

  // 8 aggressive barbed thorns jutting outward
  const spikeCount = 8;
  for (let s = 0; s < spikeCount; s++) {
    const ang = rot + (s * Math.PI * 2) / spikeCount;
    const tipX = ux + Math.cos(ang) * (prx * 1.42);
    const tipY = cy + Math.sin(ang) * (pry * 1.42);
    const b1Ang = ang - 0.22;
    const b2Ang = ang + 0.22;
    const b1x = ux + Math.cos(b1Ang) * prx;
    const b1y = cy + Math.sin(b1Ang) * pry;
    const b2x = ux + Math.cos(b2Ang) * prx;
    const b2y = cy + Math.sin(b2Ang) * pry;

    g.moveTo(b1x, b1y).lineTo(tipX, tipY).lineTo(b2x, b2y).fill({
      color: def.primaryColor,
      alpha: 0.42,
    });
    g.moveTo(b1x, b1y).lineTo(tipX, tipY).lineTo(b2x, b2y).stroke({
      color: def.accentColor,
      width: 0.9,
      alpha: 0.55,
    });
  }

  // 8 alternating inner serrations
  for (let s = 0; s < spikeCount; s++) {
    const ang = rot + ((s + 0.5) * Math.PI * 2) / spikeCount;
    const tipX = ux + Math.cos(ang) * (prx * 1.16);
    const tipY = cy + Math.sin(ang) * (pry * 1.16);
    const inX = ux + Math.cos(ang) * (prx * 0.88);
    const inY = cy + Math.sin(ang) * (pry * 0.88);
    g.moveTo(inX, inY).lineTo(tipX, tipY).stroke({ color: def.primaryColor, width: 1.0, alpha: 0.4 });
  }
}

// ----------------------------------------------------------------------------------
// 4. Blessed Aim: Golden radial starburst ring with rotating rays
// ----------------------------------------------------------------------------------
function drawBlessedAimAura(
  g: Graphics,
  ux: number,
  cy: number,
  now: number,
  rx: number,
  ry: number,
  seed: number,
  def: ReturnType<typeof getAuraDefinition>
): void {
  const rot = now * 0.0011 + seed;
  const pulse = 1 + 0.035 * Math.sin(now * 0.002 + seed);
  const prx = rx * pulse;
  const pry = ry * pulse;

  // Concentric sacred gold rings
  g.ellipse(ux, cy, prx, pry).stroke({ color: def.primaryColor, width: 1.4, alpha: 0.35 });
  g.ellipse(ux, cy, prx * 0.65, pry * 0.65).stroke({ color: def.secondaryColor, width: 0.9, alpha: 0.25 });

  // 8 rotating golden starburst rays
  const rayCount = 8;
  for (let r = 0; r < rayCount; r++) {
    const ang = rot + (r * Math.PI * 2) / rayCount;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const startX = ux + cos * (prx * 0.7);
    const startY = cy + sin * (pry * 0.7);
    const endX = ux + cos * (prx * 1.4);
    const endY = cy + sin * (pry * 1.4);

    g.moveTo(startX, startY).lineTo(endX, endY).stroke({
      color: def.accentColor,
      width: 1.2,
      alpha: 0.42,
    });

    // Starburst diamond tip
    const tang = ang + Math.PI / 2;
    const tcos = Math.cos(tang) * 1.5;
    const tsin = Math.sin(tang) * 0.75;
    g.moveTo(endX, endY - 1.5)
      .lineTo(endX + tcos, endY + tsin)
      .lineTo(endX, endY + 1.5)
      .lineTo(endX - tcos, endY - tsin)
      .fill({ color: def.accentColor, alpha: 0.55 });
  }
}

// ----------------------------------------------------------------------------------
// 5. Holy Freeze: Cyan-ice jagged crystalline ring pulsing cold mist & freezing waves
// ----------------------------------------------------------------------------------
function drawHolyFreezeAura(
  g: Graphics,
  ux: number,
  cy: number,
  now: number,
  rx: number,
  ry: number,
  seed: number,
  def: ReturnType<typeof getAuraDefinition>
): void {
  const rotCW = now * 0.0006;
  const rotCCW = -now * 0.0008;

  // Glacial ice rings
  g.ellipse(ux, cy, rx, ry).stroke({ color: def.primaryColor, width: 1.6, alpha: 0.35 });
  g.ellipse(ux, cy, rx * 0.7, ry * 0.7).stroke({ color: def.secondaryColor, width: 1.0, alpha: 0.25 });

  // Expanding cold mist wave
  const wave = (now * 0.0006 + seed * 0.2) % 1;
  g.ellipse(ux, cy, rx * (0.35 + wave * 0.65), ry * (0.35 + wave * 0.65)).stroke({
    color: def.accentColor,
    width: 0.9,
    alpha: (1 - wave) * 0.25,
  });

  // 6 jagged crystalline frost shards pointing outward
  const shardCount = 6;
  for (let s = 0; s < shardCount; s++) {
    const ang = rotCW + (s * Math.PI * 2) / shardCount;
    const tipX = ux + Math.cos(ang) * (rx * 1.35);
    const tipY = cy + Math.sin(ang) * (ry * 1.35);
    const inX = ux + Math.cos(ang) * (rx * 0.82);
    const inY = cy + Math.sin(ang) * (ry * 0.82);
    g.moveTo(inX, inY).lineTo(tipX, tipY).stroke({ color: def.accentColor, width: 1.3, alpha: 0.45 });

    // Crystalline facet barb
    const sideAng = ang + Math.PI / 4;
    const sx = ux + Math.cos(ang) * rx + Math.cos(sideAng) * 2.0;
    const sy = cy + Math.sin(ang) * ry + Math.sin(sideAng) * 1.0;
    g.moveTo(inX, inY).lineTo(sx, sy).stroke({ color: def.secondaryColor, width: 0.8, alpha: 0.35 });
  }

  // 4 floating orbiting frost motes
  for (let m = 0; m < 4; m++) {
    const mAng = rotCCW + (m * Math.PI * 2) / 4;
    const mx = ux + Math.cos(mAng) * (rx * 1.05);
    const my = cy + Math.sin(mAng) * (ry * 1.05);
    g.circle(mx, my, 0.9).fill({ color: def.accentColor, alpha: 0.5 });
  }
}

// ----------------------------------------------------------------------------------
// 6. Holy Shock: Crackling electric azure/white lightning arcs on ground with sparks
// ----------------------------------------------------------------------------------
function drawHolyShockAura(
  g: Graphics,
  ux: number,
  cy: number,
  now: number,
  rx: number,
  ry: number,
  seed: number,
  def: ReturnType<typeof getAuraDefinition>
): void {
  // Ground conduit glow
  g.ellipse(ux, cy, rx, ry).stroke({ color: def.primaryColor, width: 1.4, alpha: 0.3 });

  // 5 crackling dynamic zig-zag lightning arcs around the perimeter
  const arcCount = 5;
  for (let a = 0; a < arcCount; a++) {
    const a1 = (a / arcCount) * Math.PI * 2 + now * 0.0009;
    const a2 = ((a + 1) / arcCount) * Math.PI * 2 + now * 0.0009;
    const x1 = ux + Math.cos(a1) * rx;
    const y1 = cy + Math.sin(a1) * ry;
    const x2 = ux + Math.cos(a2) * rx;
    const y2 = cy + Math.sin(a2) * ry;

    // High frequency jitter for electric crackle
    const jitter = Math.sin(now * 0.035 + a * 4.2 + seed) > 0 ? 2.2 : -2.2;
    const mx = (x1 + x2) * 0.5 + Math.cos(a1 + 1.57) * jitter;
    const my = (y1 + y2) * 0.5 + Math.sin(a1 + 1.57) * (jitter * 0.47);

    g.moveTo(x1, y1).lineTo(mx, my).lineTo(x2, y2).stroke({
      color: def.accentColor,
      width: 1.1,
      alpha: 0.48,
    });
  }

  // 4 jumping ground sparks
  for (let s = 0; s < 4; s++) {
    const sAng = s * 1.57 + now * 0.002;
    const distM = 0.8 + 0.3 * Math.sin(now * 0.02 + s * 3);
    const sx = ux + Math.cos(sAng) * (rx * distM);
    const sy = cy + Math.sin(sAng) * (ry * distM);
    g.circle(sx, sy, 0.8).fill({ color: def.accentColor, alpha: 0.65 });
  }
}

// ----------------------------------------------------------------------------------
// 7. Sanctuary: Celestial white-turquoise runic mandala repelling & damaging undead
// ----------------------------------------------------------------------------------
function drawSanctuaryAura(
  g: Graphics,
  ux: number,
  cy: number,
  now: number,
  rx: number,
  ry: number,
  seed: number,
  def: ReturnType<typeof getAuraDefinition>
): void {
  const rot = now * 0.0005 + seed;
  const pulse = 1 + 0.03 * Math.sin(now * 0.002);
  const prx = rx * pulse;
  const pry = ry * pulse;

  // Outer celestial circle
  g.ellipse(ux, cy, prx, pry).stroke({ color: def.primaryColor, width: 1.4, alpha: 0.35 });

  // Sacred hexagram / mandala interlocking arcs (6 vertices)
  const nodeCount = 6;
  for (let n = 0; n < nodeCount; n++) {
    const ang1 = rot + (n * Math.PI * 2) / nodeCount;
    const ang2 = rot + ((n + 2) * Math.PI * 2) / nodeCount;
    const x1 = ux + Math.cos(ang1) * prx;
    const y1 = cy + Math.sin(ang1) * pry;
    const x2 = ux + Math.cos(ang2) * prx;
    const y2 = cy + Math.sin(ang2) * pry;

    g.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: def.secondaryColor, width: 0.85, alpha: 0.3 });

    // Celestial node glyph at vertex
    g.circle(x1, y1, 1.2).fill({ color: def.accentColor, alpha: 0.55 });
  }

  // Inner sanctum diamond
  g.ellipse(ux, cy, prx * 0.45, pry * 0.45).stroke({ color: def.accentColor, width: 1.1, alpha: 0.4 });
}

// ----------------------------------------------------------------------------------
// 8. Fanaticism: Aggressive spinning serrated gold/crimson gear with orbiting motes
// ----------------------------------------------------------------------------------
function drawFanaticismAura(
  g: Graphics,
  ux: number,
  cy: number,
  now: number,
  rx: number,
  ry: number,
  seed: number,
  def: ReturnType<typeof getAuraDefinition>
): void {
  const rot = now * 0.0028 + seed; // fast aggressive rotation

  // Inner core ring
  g.ellipse(ux, cy, rx * 0.82, ry * 0.82).stroke({ color: def.primaryColor, width: 1.8, alpha: 0.38 });

  // 12-tooth serrated gear
  const teethCount = 12;
  const outerRx = rx * 1.25;
  const outerRy = ry * 1.25;
  const innerRx = rx * 0.88;
  const innerRy = ry * 0.88;

  for (let t = 0; t < teethCount; t++) {
    const ang1 = rot + (t * Math.PI * 2) / teethCount;
    const ang2 = ang1 + Math.PI / teethCount;
    const x1 = ux + Math.cos(ang1) * innerRx;
    const y1 = cy + Math.sin(ang1) * innerRy;
    const tipX = ux + Math.cos((ang1 + ang2) * 0.5) * outerRx;
    const tipY = cy + Math.sin((ang1 + ang2) * 0.5) * outerRy;
    const x2 = ux + Math.cos(ang2) * innerRx;
    const y2 = cy + Math.sin(ang2) * innerRy;

    g.moveTo(x1, y1).lineTo(tipX, tipY).lineTo(x2, y2).fill({
      color: def.secondaryColor,
      alpha: 0.4,
    });
    g.moveTo(x1, y1).lineTo(tipX, tipY).lineTo(x2, y2).stroke({
      color: def.accentColor,
      width: 0.9,
      alpha: 0.5,
    });
  }

  // 3 orbiting energy motes at high speed
  for (let m = 0; m < 3; m++) {
    const mAng = -rot * 1.4 + (m * Math.PI * 2) / 3;
    const mx = ux + Math.cos(mAng) * (rx * 1.15);
    const my = cy + Math.sin(mAng) * (ry * 1.15);
    g.circle(mx, my, 1.2).fill({ color: def.accentColor, alpha: 0.65 });
  }
}

// ----------------------------------------------------------------------------------
// 9. Conviction: Eerie sickly green downward pointing runic spikes & glyph ring
// ----------------------------------------------------------------------------------
function drawConvictionAura(
  g: Graphics,
  ux: number,
  cy: number,
  now: number,
  rx: number,
  ry: number,
  seed: number,
  def: ReturnType<typeof getAuraDefinition>
): void {
  const rot = -now * 0.0006 + seed;
  const pulse = 1 + 0.04 * Math.sin(now * 0.0022 + seed);
  const prx = rx * pulse;
  const pry = ry * pulse;

  // Sickly green outer glyph ring
  g.ellipse(ux, cy, prx, pry).stroke({ color: def.primaryColor, width: 1.6, alpha: 0.35 });

  // 6 downward pointing runic glyph daggers extending beneath feet
  const glyphCount = 6;
  for (let gIdx = 0; gIdx < glyphCount; gIdx++) {
    const ang = rot + (gIdx * Math.PI * 2) / glyphCount;
    const bx = ux + Math.cos(ang) * prx;
    const by = cy + Math.sin(ang) * pry;
    const tipX = bx;
    const tipY = by + 4.5; // downward pointing runic spike

    g.moveTo(bx - 1.5, by).lineTo(tipX, tipY).lineTo(bx + 1.5, by).fill({
      color: def.secondaryColor,
      alpha: 0.45,
    });
    g.moveTo(bx, by - 2).lineTo(tipX, tipY).stroke({
      color: def.accentColor,
      width: 0.9,
      alpha: 0.55,
    });
  }

  // Floating eerie green glyph motes
  for (let m = 0; m < 3; m++) {
    const phase = (now * 0.0006 + m * 0.33 + seed * 0.2) % 1;
    const mAng = m * 2.09 + now * 0.0004;
    const mx = ux + Math.cos(mAng) * (prx * 0.65);
    const my = cy + Math.sin(mAng) * (pry * 0.65) - phase * 5;
    g.circle(mx, my, 0.8).fill({ color: def.accentColor, alpha: (1 - phase) * 0.45 });
  }
}

// ----------------------------------------------------------------------------------
// 10. Prayer: Soothing azure/white soft ring with rising healing glimmers
// ----------------------------------------------------------------------------------
function drawPrayerAura(
  g: Graphics,
  ux: number,
  cy: number,
  now: number,
  rx: number,
  ry: number,
  seed: number,
  def: ReturnType<typeof getAuraDefinition>
): void {
  const pulse = 1 + 0.05 * Math.sin(now * 0.0018 + seed);
  const prx = rx * pulse;
  const pry = ry * pulse;

  // Gentle soothing halos
  g.ellipse(ux, cy, prx, pry).stroke({ color: def.primaryColor, width: 1.4, alpha: 0.32 });
  g.ellipse(ux, cy, prx * 0.68, pry * 0.68).stroke({ color: def.secondaryColor, width: 1.0, alpha: 0.22 });

  // 5 rising healing glimmers drifting upward and gently fading
  for (let m = 0; m < 5; m++) {
    const phase = (now * 0.0008 + m * 0.2 + seed * 0.1) % 1;
    const mAng = m * 1.25 + now * 0.0004;
    const mrx = prx * (0.3 + phase * 0.5);
    const mry = pry * (0.3 + phase * 0.5);
    const mx = ux + Math.cos(mAng) * mrx + Math.sin(now * 0.005 + m) * 1.5;
    const my = cy + Math.sin(mAng) * mry - phase * 12;
    g.circle(mx, my, 0.95).fill({ color: def.accentColor, alpha: (1 - phase) * 0.55 });
  }
}

// ----------------------------------------------------------------------------------
// 11. Defiance: Steely silver/blue fortified shield crests rotating on ground
// ----------------------------------------------------------------------------------
function drawDefianceAura(
  g: Graphics,
  ux: number,
  cy: number,
  now: number,
  rx: number,
  ry: number,
  seed: number,
  def: ReturnType<typeof getAuraDefinition>
): void {
  const rot = now * 0.0005 + seed;

  // Fortress battlement ring
  g.ellipse(ux, cy, rx, ry).stroke({ color: def.primaryColor, width: 1.8, alpha: 0.35 });

  // 6 heraldic shield crests along the perimeter
  const crestCount = 6;
  for (let c = 0; c < crestCount; c++) {
    const ang = rot + (c * Math.PI * 2) / crestCount;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const cxPos = ux + cos * rx;
    const cyPos = cy + sin * ry;

    // Shield crest: top flat, bottom pointed
    const tang = ang + Math.PI / 2;
    const tx = Math.cos(tang) * 2.2;
    const ty = Math.sin(tang) * 1.1;

    g.moveTo(cxPos - tx, cyPos - ty)
      .lineTo(cxPos + tx, cyPos + ty)
      .lineTo(cxPos + cos * 2.8, cyPos + sin * 1.4)
      .fill({ color: def.secondaryColor, alpha: 0.48 });
    g.moveTo(cxPos - tx, cyPos - ty)
      .lineTo(cxPos + tx, cyPos + ty)
      .lineTo(cxPos + cos * 2.8, cyPos + sin * 1.4)
      .stroke({ color: def.accentColor, width: 0.9, alpha: 0.6 });
  }
}

// ----------------------------------------------------------------------------------
// 12. Cleansing: Emerald/teal mist ring rapidly reducing poison & curse duration
// ----------------------------------------------------------------------------------
function drawCleansingAura(
  g: Graphics,
  ux: number,
  cy: number,
  now: number,
  rx: number,
  ry: number,
  seed: number,
  def: ReturnType<typeof getAuraDefinition>
): void {
  const rot = now * 0.0014 + seed;

  // Swirling mist ring
  g.ellipse(ux, cy, rx, ry).stroke({ color: def.primaryColor, width: 1.5, alpha: 0.3 });

  // 3 spiral vortex arms swirling outward
  for (let arm = 0; arm < 3; arm++) {
    const baseAng = rot + (arm * Math.PI * 2) / 3;
    g.moveTo(ux, cy);
    for (let step = 1; step <= 5; step++) {
      const t = step / 5;
      const stepAng = baseAng + t * 1.2;
      const sx = ux + Math.cos(stepAng) * (rx * t);
      const sy = cy + Math.sin(stepAng) * (ry * t);
      g.lineTo(sx, sy);
    }
    g.stroke({ color: def.accentColor, width: 1.1, alpha: 0.35 });
  }

  // Purifying mist motes
  for (let m = 0; m < 3; m++) {
    const phase = (now * 0.0008 + m * 0.33) % 1;
    const mAng = rot + m * 2.09;
    const mx = ux + Math.cos(mAng) * (rx * phase);
    const my = cy + Math.sin(mAng) * (ry * phase);
    g.circle(mx, my, 0.85).fill({ color: def.accentColor, alpha: (1 - phase) * 0.45 });
  }
}

// ----------------------------------------------------------------------------------
// 13. Vigor: Fast spinning bright green directional chevron arrows with motion dust
// ----------------------------------------------------------------------------------
function drawVigorAura(
  g: Graphics,
  ux: number,
  cy: number,
  now: number,
  rx: number,
  ry: number,
  seed: number,
  def: ReturnType<typeof getAuraDefinition>
): void {
  const rot = now * 0.0034 + seed; // fast velocity rotation

  // Speed ring
  g.ellipse(ux, cy, rx, ry).stroke({ color: def.primaryColor, width: 1.3, alpha: 0.32 });

  // 4 directional chevron arrows (>> >> >> >>) aligned along the perimeter
  const arrowCount = 4;
  for (let a = 0; a < arrowCount; a++) {
    const ang = rot + (a * Math.PI * 2) / arrowCount;
    const tipX = ux + Math.cos(ang) * rx;
    const tipY = cy + Math.sin(ang) * ry;

    // Direction vector tangent to ellipse
    const tang = ang + Math.PI / 2;
    const backAng = tang - Math.PI;
    const bx1 = tipX + Math.cos(backAng - 0.5) * 3.5;
    const by1 = tipY + Math.sin(backAng - 0.5) * 1.8;
    const bx2 = tipX + Math.cos(backAng + 0.5) * 3.5;
    const by2 = tipY + Math.sin(backAng + 0.5) * 1.8;

    g.moveTo(bx1, by1).lineTo(tipX, tipY).lineTo(bx2, by2).stroke({
      color: def.accentColor,
      width: 1.3,
      alpha: 0.58,
    });

    // Trailing speed dust
    const dustX = tipX + Math.cos(backAng) * 5.0;
    const dustY = tipY + Math.sin(backAng) * 2.5;
    g.circle(dustX, dustY, 0.75).fill({ color: def.accentColor, alpha: 0.4 });
  }
}

// ----------------------------------------------------------------------------------
// 14. Meditation: Deep sapphire/indigo mystical mandala ring with mana waves
// ----------------------------------------------------------------------------------
function drawMeditationAura(
  g: Graphics,
  ux: number,
  cy: number,
  now: number,
  rx: number,
  ry: number,
  seed: number,
  def: ReturnType<typeof getAuraDefinition>
): void {
  const rot = now * 0.0004 + seed;
  const wave = 1 + 0.05 * Math.sin(now * 0.0025);

  // Concentric mystical mandala rings
  g.ellipse(ux, cy, rx * wave, ry * wave).stroke({ color: def.primaryColor, width: 1.6, alpha: 0.35 });
  g.ellipse(ux, cy, rx * 0.65, ry * 0.65).stroke({ color: def.secondaryColor, width: 1.1, alpha: 0.28 });

  // 8 lotus / mandala petals undulating smoothly
  const petalCount = 8;
  for (let p = 0; p < petalCount; p++) {
    const ang = rot + (p * Math.PI * 2) / petalCount;
    const petalR = rx * (0.8 + 0.18 * Math.sin(ang * 4 + now * 0.002));
    const px = ux + Math.cos(ang) * petalR;
    const py = cy + Math.sin(ang) * (petalR * ASPECT);
    g.circle(px, py, 1.1).fill({ color: def.accentColor, alpha: 0.5 });
  }

  // 4 cardinal mana nodes
  for (let c = 0; c < 4; c++) {
    const ang = rot + (c * Math.PI) / 2;
    const inX = ux + Math.cos(ang) * (rx * 0.5);
    const inY = cy + Math.sin(ang) * (ry * 0.5);
    const outX = ux + Math.cos(ang) * (rx * 1.15);
    const outY = cy + Math.sin(ang) * (ry * 1.15);
    g.moveTo(inX, inY).lineTo(outX, outY).stroke({ color: def.accentColor, width: 0.9, alpha: 0.38 });
  }
}

// ----------------------------------------------------------------------------------
// 15. Redemption: Ethereal ghostly wisps rising from fallen monsters into the hero
// ----------------------------------------------------------------------------------
function drawRedemptionAura(
  g: Graphics,
  ux: number,
  cy: number,
  now: number,
  rx: number,
  ry: number,
  seed: number,
  def: ReturnType<typeof getAuraDefinition>
): void {
  // Sacred gold ground seal
  g.ellipse(ux, cy, rx, ry).stroke({ color: def.primaryColor, width: 1.5, alpha: 0.32 });
  g.ellipse(ux, cy, rx * 0.65, ry * 0.65).stroke({ color: def.secondaryColor, width: 1.0, alpha: 0.25 });

  // 5 ethereal ghostly wisps rising from ground edge and curling inward
  const wispCount = 5;
  for (let w = 0; w < wispCount; w++) {
    const phase = (now * 0.0007 + w * 0.2 + seed * 0.1) % 1;
    const startAng = w * 1.25 + now * 0.0003;
    const currDist = rx * (1.1 - phase * 0.7);
    const currAng = startAng + phase * 0.8;
    const wx = ux + Math.cos(currAng) * currDist;
    const wy = cy + Math.sin(currAng) * (currDist * ASPECT) - phase * 10;

    g.circle(wx, wy, 1.1 - phase * 0.4).fill({
      color: def.accentColor,
      alpha: (1 - phase) * 0.55,
    });
  }
}

// ----------------------------------------------------------------------------------
// 16. Salvation: Radiant golden prism dome ring protecting against Fire, Cold, Lightning
// ----------------------------------------------------------------------------------
function drawSalvationAura(
  g: Graphics,
  ux: number,
  cy: number,
  now: number,
  rx: number,
  ry: number,
  seed: number,
  def: ReturnType<typeof getAuraDefinition>
): void {
  const rot = now * 0.0008 + seed;

  // Foundation gold ring
  g.ellipse(ux, cy, rx, ry).stroke({ color: def.primaryColor, width: 1.6, alpha: 0.35 });

  // Prismatic multi-elemental arc segments: Red (Fire), Blue (Cold), Yellow (Lightning)
  const prismColors = [0xef4444, 0x38bdf8, 0xfacc15];
  for (let p = 0; p < 6; p++) {
    const a1 = rot + (p * Math.PI) / 3;
    const a2 = a1 + (Math.PI / 3) * 0.85;
    const col = prismColors[p % 3];
    const x1 = ux + Math.cos(a1) * (rx * 1.15);
    const y1 = cy + Math.sin(a1) * (ry * 1.15);
    const x2 = ux + Math.cos(a2) * (rx * 1.15);
    const y2 = cy + Math.sin(a2) * (ry * 1.15);

    g.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: col, width: 1.2, alpha: 0.45 });
  }

  // Protective dome overhead shimmer arc
  const domePulse = 1 + 0.03 * Math.sin(now * 0.003);
  g.ellipse(ux, cy - 6, rx * 0.9 * domePulse, ry * 0.7 * domePulse).stroke({
    color: def.accentColor,
    width: 0.8,
    alpha: 0.22,
  });
}

// ----------------------------------------------------------------------------------
// 17. Concentration: Golden dual concentric oscillating rings with floating runes
// ----------------------------------------------------------------------------------
function drawConcentrationAura(
  g: Graphics,
  ux: number,
  cy: number,
  now: number,
  rx: number,
  ry: number,
  seed: number,
  def: ReturnType<typeof getAuraDefinition>
): void {
  // Dual concentric oscillating rings pulsating in opposition
  const osc1 = 1 + 0.04 * Math.sin(now * 0.003 + seed);
  const osc2 = 1 - 0.04 * Math.sin(now * 0.003 + seed);
  const rx1 = rx * 1.15 * osc1;
  const ry1 = ry * 1.15 * osc1;
  const rx2 = rx * 0.72 * osc2;
  const ry2 = ry * 0.72 * osc2;

  g.ellipse(ux, cy, rx1, ry1).stroke({ color: def.primaryColor, width: 1.4, alpha: 0.35 });
  g.ellipse(ux, cy, rx2, ry2).stroke({ color: def.secondaryColor, width: 1.2, alpha: 0.28 });

  // 6 floating sacred runes orbiting between the two rings
  const runeCount = 6;
  const rot = now * 0.0009 + seed;
  for (let r = 0; r < runeCount; r++) {
    const ang = rot + (r * Math.PI * 2) / runeCount;
    const midRx = (rx1 + rx2) * 0.5;
    const midRy = (ry1 + ry2) * 0.5;
    const rxPos = ux + Math.cos(ang) * midRx;
    const ryPos = cy + Math.sin(ang) * midRy;

    // Small sacred rune mark
    g.circle(rxPos, ryPos, 1.2).fill({ color: def.accentColor, alpha: 0.55 });
    g.circle(rxPos, ryPos, 1.8).stroke({ color: def.primaryColor, width: 0.8, alpha: 0.4 });
  }
}

/**
 * High-performance battlefield renderer for all active unit auras & conviction decals.
 */
export function renderUnitAuras(
  g: Graphics,
  sim: Sim,
  now: number,
  k: number,
  mapW: number,
  minTx = 0,
  maxTx = mapW - 1,
  minTy = 0,
  maxTy = sim.map.h - 1,
): void {
  const count = sim.count;
  const cx0 = minTx - 2;
  const cx1 = maxTx + 2;
  const cy0 = minTy - 2;
  const cy1 = maxTy + 2;

  for (let i = 0; i < count; i++) {
    if (sim.cb.hp[i] <= 0 || sim.hidden[i]) continue;
    const tx = Math.floor(sim.x[i] / FP);
    const ty = Math.floor(sim.y[i] / FP);
    if (tx < cx0 || tx > cx1 || ty < cy0 || ty > cy1) continue;
    const tile = ty * mapW + tx;
    if (!sim.visible[tile]) continue;

    const ux = sim.x[i] * k;
    const uy = sim.y[i] * k;

    // 1. Render all primary active auras radiating from this unit
    const activeAuras = getUnitActiveAuras(sim, i);
    for (const auraId of activeAuras) {
      renderVanguardAura(g, auraId, ux, uy, now, 1.0, i);
    }

    // 2. If unit is an enemy afflicted by Conviction, render the conviction glyph decal
    if (isUnitUnderConviction(sim, i) && !activeAuras.includes('conviction')) {
      renderVanguardAura(g, 'conviction', ux, uy, now, 0.85, i);
    }

    // 3. Super-Unique Signature Crown & Elemental Halo
    const su = getSuperUniqueForUnit(sim, i);
    if (su) {
      const pulse = 1 + 0.09 * Math.sin(now * 0.005 + i);
      const rx = 21 * su.visual.scale * 0.8 * pulse;
      const ry = 10.5 * su.visual.scale * 0.8 * pulse;
      const rot = -now * 0.0018;
      g.ellipse(ux, uy + 2, rx * 1.15, ry * 1.15).stroke({
        color: su.visual.auraColor,
        width: 1.6,
        alpha: 0.35,
      });
      g.ellipse(ux, uy + 2, rx * 0.82, ry * 0.82).stroke({
        color: su.visual.tint,
        width: 1.0,
        alpha: 0.25,
      });
      for (let p = 0; p < 8; p++) {
        const ang = rot + p * (Math.PI / 4);
        const bx = ux + Math.cos(ang) * rx;
        const by = uy + 2 + Math.sin(ang) * ry;
        const tx = ux + Math.cos(ang) * (rx * 1.25);
        const ty = uy + 2 + Math.sin(ang) * (ry * 1.25);
        g.moveTo(bx, by)
          .lineTo(tx, ty)
          .stroke({ color: su.visual.auraColor, width: 0.9, alpha: 0.35 });
      }
    }
  }
}
