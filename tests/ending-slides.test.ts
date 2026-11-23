import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { completeNode, newProgress, parseCampaign } from '../src/campaign';
import {
  ALL_STORY_SEQUENCES,
  ENDING_SEQUENCES,
  endingForCompletedNode,
  openStory,
  sequenceById,
  sequenceForNode,
} from '../src/story';

describe('Canonical Ending Story Slides (cs_act2_end, cs_act4_end_order, cs_act4_end_ember)', () => {
  const campaignJson = JSON.parse(readFileSync(new URL('../public/data/campaign.json', import.meta.url), 'utf8'));
  const campaign = parseCampaign(campaignJson);

  it('defines cs_act2_end with exact Bible Scene 3 caption, reflection, backdrop, and sombre music', () => {
    const seq = sequenceById('cs_act2_end');
    expect(seq.act).toBe(2);
    expect(seq.kind).toBe('ending');
    expect(seq.completedNodeTrigger).toBe('m23-fork-of-spears');
    expect(seq.music).toBe('music_cutscene_omen');

    const slide = seq.slides[0];
    expect(slide.backdrop).toBe('/art/slides/slide_act2_dry_cistern.jpg');
    expect(existsSync(join(import.meta.dirname, '..', 'public', slide.backdrop.replace(/^\/+/, '')))).toBe(true);
    expect(existsSync(join(import.meta.dirname, '..', 'public', 'audio', `${seq.music}.m4a`))).toBe(true);

    expect(slide.caption).toBe(
      'The great iron sluice-gates groan open onto a subterranean cathedral engineered for three million barrels of glacial water. Instead, dry wind whistles across a silent canyon of cracked red silt—the glaciers died fifty years ago.',
    );
    expect(slide.reflection).toBe('The well is dry. The road leads to the sea.');
  });

  it('defines cs_act4_end_order and cs_act4_end_ember with distinct backdrops, music, and exact Bible Scene 5 texts', () => {
    const order = sequenceById('cs_act4_end_order');
    const ember = sequenceById('cs_act4_end_ember');

    expect(order.act).toBe(4);
    expect(order.kind).toBe('ending');
    expect(order.music).toBe('music_ending_crown');
    expect(order.slides[0].backdrop).toBe('/art/slides/slide_ending_a_purging.jpg');
    expect(order.slides[0].caption).toBe(
      'With a chime of sundered granite, the necrotic tether snaps. Molten fissures cool into harmless black basalt as clean mountain winds sweep the Caldera, and far to the west, the returning sails of the fleet turn homeward.',
    );
    expect(order.slides[0].reflection).toBe(
      'The nightmare is broken. Our hands are stained with ash, but the sky—for the first time in an age—is blue.',
    );

    expect(ember.act).toBe(4);
    expect(ember.kind).toBe('ending');
    expect(ember.music).toBe('music_ending_ember');
    expect(ember.slides[0].backdrop).toBe('/art/slides/slide_ending_b_sovereign.jpg');
    expect(ember.slides[0].caption).toBe(
      'Vorak sinks into the magma, yet the Crown of Thorns and Cinder waits upon the obsidian altar. Lifting it, the hero bends every leyline of the continent to a single, unbreakable sovereign will.',
    );
    expect(ember.slides[0].reflection).toBe(
      'Let them call it tyranny. Beneath the rule of steel and cinder, no storm, no traitor, and no god will ever break these borders again.',
    );

    expect(order.slides[0].backdrop).not.toBe(ember.slides[0].backdrop);
    expect(order.music).not.toBe(ember.music);
    expect(existsSync(join(import.meta.dirname, '..', 'public', order.slides[0].backdrop.replace(/^\/+/, '')))).toBe(true);
    expect(existsSync(join(import.meta.dirname, '..', 'public', ember.slides[0].backdrop.replace(/^\/+/, '')))).toBe(true);
    expect(existsSync(join(import.meta.dirname, '..', 'public', 'audio', `${order.music}.m4a`))).toBe(true);
    expect(existsSync(join(import.meta.dirname, '..', 'public', 'audio', `${ember.music}.m4a`))).toBe(true);
  });

  it('triggers cs_act2_end, cs_act4_end_order, and cs_act4_end_ember on completion of m23, m45, and m46', () => {
    expect(endingForCompletedNode('m23')?.id).toBe('cs_act2_end');
    expect(endingForCompletedNode('m23-fork-of-spears')?.id).toBe('cs_act2_end');
    expect(endingForCompletedNode('m45')?.id).toBe('cs_act4_end_order');
    expect(endingForCompletedNode('m45-crown-of-order')?.id).toBe('cs_act4_end_order');
    expect(endingForCompletedNode('m46')?.id).toBe('cs_act4_end_ember');
    expect(endingForCompletedNode('m46-ember-reckoning')?.id).toBe('cs_act4_end_ember');
    expect(endingForCompletedNode('m01-blood-at-the-ford')).toBeNull();

    // Simulate campaign completions on m23, m45, and m46
    let progress = newProgress(campaign, 1);
    progress = {
      ...progress,
      unlocked: [...progress.unlocked, 'm23-fork-of-spears', 'm45-crown-of-order', 'm46-ember-reckoning'],
      node: 'm23-fork-of-spears',
    };

    progress = completeNode(campaign, progress, 'm23-fork-of-spears');
    expect(progress.completed).toContain('m23-fork-of-spears');
    expect(endingForCompletedNode('m23-fork-of-spears')?.id).toBe('cs_act2_end');

    const orderDone = completeNode(campaign, progress, 'm45-crown-of-order');
    expect(orderDone.completed).toContain('m45-crown-of-order');
    expect(endingForCompletedNode('m45-crown-of-order')?.id).toBe('cs_act4_end_order');
    expect(sequenceForNode('m45-crown-of-order')?.music).toBe('music_ending_crown');

    const emberDone = completeNode(campaign, progress, 'm46-ember-reckoning');
    expect(emberDone.completed).toContain('m46-ember-reckoning');
    expect(endingForCompletedNode('m46-ember-reckoning')?.id).toBe('cs_act4_end_ember');
    expect(sequenceForNode('m46-ember-reckoning')?.music).toBe('music_ending_ember');
  });

  it('supports opening all three ending cutscenes and wires them in shell/modals', () => {
    expect(ENDING_SEQUENCES.map((s) => s.id)).toEqual([
      'cs_act2_end',
      'cs_act4_end_order',
      'cs_act4_end_ember',
    ]);
    expect(ALL_STORY_SEQUENCES.length).toBe(9);

    for (const id of ['cs_act2_end', 'cs_act4_end_order', 'cs_act4_end_ember'] as const) {
      const player = openStory(id);
      expect(player.sequence.id).toBe(id);
      expect(player.index).toBe(0);
      expect(player.finished).toBe(false);
    }

    const shellSrc = readFileSync(new URL('../src/shell.ts', import.meta.url), 'utf8');
    const modalsSrc = readFileSync(new URL('../src/shell/modals.ts', import.meta.url), 'utf8');
    expect(shellSrc).toContain('endingForCompletedNode');
    expect(modalsSrc).toContain('cs_act2_end');
    expect(modalsSrc).toContain('cs_act4_end_order');
    expect(modalsSrc).toContain('cs_act4_end_ember');
    expect(modalsSrc).toContain('playEndingMusic');
  });
});
