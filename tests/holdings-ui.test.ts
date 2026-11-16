import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('UI & Visual Ergonomics: Holdings Modal, HUD Quest Tracker & Minimap', () => {
  const styleCss = readFileSync(resolve(__dirname, '../src/style.css'), 'utf8');
  const gothicHudCss = readFileSync(resolve(__dirname, '../src/gothic-hud.css'), 'utf8');
  const townstyleCss = readFileSync(resolve(__dirname, '../src/townstyle.css'), 'utf8');

  describe('1. Holdings Modal ("Holdings") Viewport Containment & Touch Ergonomics', () => {
    it('enforces 100dvh containment and overflow: hidden on holdings modal and box', () => {
      expect(styleCss).toContain('#shell .sh-holdings-modal');
      expect(styleCss).toContain('#shell .sh-holdings-box');
      expect(styleCss).toMatch(/#shell\s+\.sh-holdings-modal\s*\{[^}]*overflow:\s*hidden;/);
      expect(styleCss).toMatch(/#shell\s+\.sh-holdings-box\s*\{[^}]*max-height:\s*calc\(100dvh\s*-\s*16px\);/);
      expect(styleCss).toMatch(/#shell\s+\.sh-holdings-box\s*\{[^}]*overflow:\s*hidden;/);
    });

    it('formats each building row as a two-column grid with 44px-48px touch-friendly action buttons', () => {
      expect(styleCss).toMatch(/#shell\s+\.sh-hold\s*\{[^}]*display:\s*grid;/);
      expect(styleCss).toMatch(/#shell\s+\.sh-hold\s*\{[^}]*grid-template-columns:\s*1fr\s+auto;/);
      expect(styleCss).toMatch(/#shell\s+\.sh-hold\s*>\s*\.sh-btn\.sh-hold-btn[^}]*min-height:\s*44px;/);
      expect(styleCss).toMatch(/#shell\s+\.sh-hold\s*>\s*\.sh-btn\.sh-hold-btn[^}]*min-width:/);
    });

    it('activates compact two-column landscape grid under 520px height to prevent vertical scrolling', () => {
      expect(styleCss).toMatch(/@media\s*\(max-height:\s*520px\)\s*and\s*\(min-width:\s*540px\)/);
      expect(styleCss).toMatch(/#shell\s+\.sh-holdings-list\s*\{[^}]*display:\s*grid;/);
      expect(styleCss).toMatch(/grid-template-columns:\s*repeat\(2,\s*1fr\);/);
    });
  });

  describe('2. HUD Quest Tracker (#objectives / .gothic-hud-tracker) Layout & Non-overlap', () => {
    it('anchors quest tracker to the left with right: auto !important to prevent stretching across the bar', () => {
      expect(styleCss).toMatch(/#objectives,\s*\.gothic-hud-tracker\s*\{[^}]*left:\s*calc\(10px\s*\+\s*env\(safe-area-inset-left\)\);/);
      expect(styleCss).toMatch(/#objectives,\s*\.gothic-hud-tracker\s*\{[^}]*right:\s*auto\s*!important;/);
      expect(styleCss).toMatch(/#objectives,\s*\.gothic-hud-tracker\s*\{[^}]*top:\s*var\(--hud-top/);
    });

    it('bounds expanded quest tracker height to prevent covering the bottom globes and action dock', () => {
      expect(styleCss).toMatch(/#objectives\.expanded,\s*\.gothic-hud-tracker\.expanded\s*\{[^}]*max-height:\s*calc\(100dvh\s*-\s*var\(--hud-top[^}]*-\s*160px\);/);
      expect(styleCss).toMatch(/#objectives\.expanded,\s*\.gothic-hud-tracker\.expanded\s*\{[^}]*overflow-y:\s*auto;/);
    });

    it('does not contain conflicting legacy stretching coordinates on #objectives', () => {
      expect(styleCss).not.toContain('#objectives { left: 24%; right: 208px;');
      expect(styleCss).not.toContain('#objectives { top: calc(var(--hud-top) + env(safe-area-inset-top)); left: 8px; right: 244px;');
    });
  });

  describe('3. Minimap Smooth Toggle & Readability', () => {
    it('defines smooth CSS transitions for width, max-height and glow effects', () => {
      expect(gothicHudCss).toMatch(/#minimap\s*\{[^}]*transition:\s*width\s+0\.22s/);
      expect(gothicHudCss).toMatch(/#minimap\.large\s*\{[^}]*width:\s*clamp\(250px/);
      expect(gothicHudCss).toMatch(/#minimap\.large\s*\{[^}]*max-height:\s*clamp\(250px/);
    });

    it('provides a dedicated toggle button with >= 44x44px touch target via pseudo element', () => {
      expect(gothicHudCss).toContain('.btn-minimap-toggle');
      expect(gothicHudCss).toMatch(/\.btn-minimap-toggle::before\s*\{[^}]*min-width:\s*44px;\s*min-height:\s*44px;/);
    });
  });

  describe('4. Mobile Touch Paperdoll Ergonomics', () => {
    it('ensures equipment buttons have >= 44px min-height even in compact landscape mode', () => {
      expect(townstyleCss).toMatch(/#sheet\s+\.hero-gear-cell\s*>\s*button:first-child\s*\{[^}]*min-height:\s*44px;/);
    });

    it('enforces Inventory (#sheet) 100dvh Zero-Scroll Rule with overflow: hidden and flex column layout', () => {
      expect(townstyleCss).toMatch(/#sheet\s*\{[^}]*max-height:\s*calc\(100dvh\s*-\s*36px\);/);
      expect(townstyleCss).toMatch(/#sheet\s*\{[^}]*overflow:\s*hidden;/);
      expect(townstyleCss).toMatch(/#sheet\s*\{[^}]*display:\s*flex;/);
      expect(townstyleCss).toMatch(/#sheet\s*\{[^}]*flex-direction:\s*column;/);
      expect(styleCss).toMatch(/#sheet\s*\{[^}]*max-height:\s*calc\(100dvh\s*-\s*36px\);/);
      expect(styleCss).toMatch(/#sheet\s*\{[^}]*overflow:\s*hidden;/);
    });

    it('centers and scales Hero Portrait in HUD to prominently display face and shoulders without clipping', () => {
      expect(gothicHudCss).toMatch(/\.hud-hero-img\s*\{[^}]*object-position:\s*50%\s+10%;/);
      expect(gothicHudCss).toMatch(/\.hud-hero-img\s*\{[^}]*transform:\s*scale\(1\.55\);/);
      expect(gothicHudCss).toMatch(/\.hud-hero-img\s*\{[^}]*transform-origin:\s*50%\s+12%;/);
      expect(styleCss).toMatch(/\.hud-hero-img\s*\{[^}]*object-position:\s*50%\s+10%;/);
    });
  });
});
