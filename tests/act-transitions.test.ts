import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { completeNode, nodeOf, parseCampaign, type CampaignProgress } from '../src/campaign';
import {
  actTransitionForCompletedNode,
  advanceStory,
  getActTransition,
  getEndingSequence,
  openStory,
  previousStory,
  replayStory,
  sequenceById,
  sequenceForNode,
  skipStory,
  STORY_SEQUENCES,
} from '../src/story';

describe('Campaign Act Transitions & Slideshow System (P22)', () => {
  const campaignJson = JSON.parse(readFileSync(new URL('../public/data/campaign.json', import.meta.url), 'utf8'));
  const campaign = parseCampaign(campaignJson);

  it('defines all 4 act introductions and 2 campaign endings with Bulgarian titles', () => {
    expect(STORY_SEQUENCES.length).toBe(6);

    const act1 = sequenceById('act-1');
    expect(act1.act).toBe(1);
    expect(act1.kind).toBe('intro');
    expect(act1.title).toContain('The Border Fords');

    // Transition Act 1 -> Act 2
    const act2 = sequenceById('act-2');
    expect(act2.act).toBe(2);
    expect(act2.kind).toBe('intro');
    expect(act2.title).toContain('The Desiccated Marches');
    expect(act2.triggerNode).toBe('m12-redmarsh-border');
    expect(act2.completedNodeTrigger).toBe('m11-ashbrook-retreat');

    // Transition Act 2 -> Act 3
    const act3 = sequenceById('act-3');
    expect(act3.act).toBe(3);
    expect(act3.kind).toBe('intro');
    expect(act3.title).toContain('Descent into the Sunless Deeps');
    expect(act3.triggerNode).toBe('m24-pledge-at-oakhaven');
    expect(act3.completedNodeTrigger).toBe('m23-fork-of-spears');

    // Transition Act 3 -> Act 4
    const act4 = sequenceById('act-4');
    expect(act4.act).toBe(4);
    expect(act4.kind).toBe('intro');
    expect(act4.title).toContain('Gates of the Infernal Sanctuary');
    expect(act4.triggerNode).toBe('m36-heartland-march');
    expect(act4.completedNodeTrigger).toBe('m35-burning-harbor');

    // Ending A: Victory
    const endingA = sequenceById('ending-a');
    expect(endingA.kind).toBe('ending');
    expect(endingA.title).toContain('The Purging of Thornvael');
    expect(endingA.triggerNode).toBe('m45-crown-of-order');

    // Ending B: Alternative Ending
    const endingB = sequenceById('ending-b');
    expect(endingB.kind).toBe('ending');
    expect(endingB.title).toContain('Rise of the Dark Sovereign');
    expect(endingB.triggerNode).toBe('m46-ember-reckoning');
  });

  it('provides reliable helper lookup for act transitions and ending branches', () => {
    expect(getActTransition(1, 2)?.id).toBe('act-2');
    expect(getActTransition(2, 3)?.id).toBe('act-3');
    expect(getActTransition(3, 4)?.id).toBe('act-4');
    expect(getActTransition(1, 4 as any)).toBeUndefined();

    expect(getEndingSequence('victory').id).toBe('ending-a');
    expect(getEndingSequence('alternative').id).toBe('ending-b');

    expect(actTransitionForCompletedNode('m11-ashbrook-retreat')?.id).toBe('act-2');
    expect(actTransitionForCompletedNode('m23-fork-of-spears')?.id).toBe('act-3');
    expect(actTransitionForCompletedNode('m35-burning-harbor')?.id).toBe('act-4');
    expect(actTransitionForCompletedNode('m01-blood-at-the-ford')).toBeNull();
  });

  it('binds story triggers exactly to key campaign nodes in the 46-mission graph', () => {
    // Act boundary missions in campaign.json
    const m11 = nodeOf(campaign, 'm11-ashbrook-retreat');
    expect(m11.act).toBe(1);
    expect(m11.unlocksOnVictory).toContain('m12-redmarsh-border');

    const m23 = nodeOf(campaign, 'm23-fork-of-spears');
    expect(m23.act).toBe(2);
    expect(m23.unlocksOnVictory).toContain('m24-pledge-at-oakhaven');

    const m35 = nodeOf(campaign, 'm35-burning-harbor');
    expect(m35.act).toBe(3);
    expect(m35.unlocksOnVictory).toContain('m36-heartland-march');

    const m44 = nodeOf(campaign, 'm44-threshold-choice');
    expect(m44.act).toBe(4);
    expect(m44.unlocksOnVictory).toContain('m45-crown-of-order');
    expect(m44.unlocksOnVictory).toContain('m46-ember-reckoning');

    // Entry triggers
    expect(sequenceForNode('m01-blood-at-the-ford')?.id).toBe('act-1');
    expect(sequenceForNode('m12-redmarsh-border')?.id).toBe('act-2');
    expect(sequenceForNode('m24-pledge-at-oakhaven')?.id).toBe('act-3');
    expect(sequenceForNode('m36-heartland-march')?.id).toBe('act-4');
    expect(sequenceForNode('m45-crown-of-order')?.id).toBe('ending-a');
    expect(sequenceForNode('m46-ember-reckoning')?.id).toBe('ending-b');
  });

  it('validates slide structural contract and audio cues across all story sequences', () => {
    const validCues = new Set(['calm', 'march', 'battle', 'triumph']);
    const allSlideIds = new Set<string>();

    for (const seq of STORY_SEQUENCES) {
      expect(seq.slides.length).toBeGreaterThanOrEqual(2);
      expect(seq.title.length).toBeGreaterThan(5);

      for (const slide of seq.slides) {
        expect(allSlideIds.has(slide.id)).toBe(false);
        allSlideIds.add(slide.id);

        expect(slide.heading.length).toBeGreaterThan(3);
        expect(slide.caption.length).toBeGreaterThan(15);
        expect(slide.backdrop).toMatch(/^\/art\/slides\/[\w.-]+\.jpg$/);
        expect(existsSync(join(import.meta.dirname, '..', 'public', slide.backdrop.replace(/^\/+/, '')))).toBe(true);
        expect(validCues.has(slide.cue)).toBe(true);
      }
    }
  });

  it('implements stateful story playback: advance, previous, skip, and replay', () => {
    let p = openStory('act-2');
    expect(p.index).toBe(0);
    expect(p.finished).toBe(false);
    expect(p.replays).toBe(0);

    // Advance forward
    p = advanceStory(p);
    expect(p.index).toBe(1);
    expect(p.finished).toBe(false);

    // Step back with previousStory
    p = previousStory(p);
    expect(p.index).toBe(0);
    expect(p.finished).toBe(false);

    // Stepping back from 0 remains at 0
    p = previousStory(p);
    expect(p.index).toBe(0);

    // Advance to end
    p = advanceStory(p);
    expect(p.index).toBe(1);
    p = advanceStory(p);
    expect(p.finished).toBe(true);

    // Advance when finished stays finished
    const pEnd = advanceStory(p);
    expect(pEnd.finished).toBe(true);

    // Replay restarts sequence
    p = replayStory(p);
    expect(p.index).toBe(0);
    expect(p.finished).toBe(false);
    expect(p.replays).toBe(1);

    // Skip immediately jumps to completion
    p = skipStory(p);
    expect(p.finished).toBe(true);
    expect(p.index).toBe(p.sequence.slides.length - 1);
  });

  it('simulates campaign act completion progression and verifies transition triggering', () => {
    let progress: CampaignProgress = {
      difficulty: 1,
      unlocked: ['m01-blood-at-the-ford'],
      completed: [],
      node: 'm01-blood-at-the-ford',
      townVisits: 0,
    };

    // Complete Act 1 finale
    progress = {
      ...progress,
      unlocked: [...progress.unlocked, 'm11-ashbrook-retreat'],
      node: 'm11-ashbrook-retreat',
    };
    progress = completeNode(campaign, progress, 'm11-ashbrook-retreat');
    expect(progress.completed).toContain('m11-ashbrook-retreat');
    expect(progress.unlocked).toContain('m12-redmarsh-border');
    const transAct2 = actTransitionForCompletedNode('m11-ashbrook-retreat');
    expect(transAct2?.id).toBe('act-2');
    expect(transAct2?.title).toContain('The Desiccated Marches');

    // Complete Act 2 finale
    progress = {
      ...progress,
      unlocked: [...progress.unlocked, 'm23-fork-of-spears'],
      node: 'm23-fork-of-spears',
    };
    progress = completeNode(campaign, progress, 'm23-fork-of-spears');
    expect(progress.completed).toContain('m23-fork-of-spears');
    expect(progress.unlocked).toContain('m24-pledge-at-oakhaven');
    const transAct3 = actTransitionForCompletedNode('m23-fork-of-spears');
    expect(transAct3?.id).toBe('act-3');
    expect(transAct3?.title).toContain('Descent into the Sunless Deeps');

    // Complete Act 3 finale
    progress = {
      ...progress,
      unlocked: [...progress.unlocked, 'm35-burning-harbor'],
      node: 'm35-burning-harbor',
    };
    progress = completeNode(campaign, progress, 'm35-burning-harbor');
    expect(progress.completed).toContain('m35-burning-harbor');
    expect(progress.unlocked).toContain('m36-heartland-march');
    const transAct4 = actTransitionForCompletedNode('m35-burning-harbor');
    expect(transAct4?.id).toBe('act-4');
    expect(transAct4?.title).toContain('Gates of the Infernal Sanctuary');

    // Branch A finale
    const endingA = sequenceForNode('m45-crown-of-order');
    expect(endingA?.id).toBe('ending-a');
    expect(endingA?.title).toContain('The Purging of Thornvael');

    // Branch B finale
    const endingB = sequenceForNode('m46-ember-reckoning');
    expect(endingB?.id).toBe('ending-b');
    expect(endingB?.title).toContain('Rise of the Dark Sovereign');
  });

  it('enforces UI Viewport Containment Rule and touch target compliance in style.css', () => {
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

    // Slideshow overlay containment
    expect(css).toContain('.sh-slideshow-overlay');
    expect(css).toContain('100dvh');
    expect(css).toContain('overflow: hidden');

    // Frame containment
    expect(css).toContain('.sh-slideshow-frame');
    expect(css).toContain('max-height: 92dvh');

    // Button touch target compliance (>= 44px)
    expect(css).toContain('.sh-slideshow-btn');
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('min-width: 44px');

    // Fade animation transition
    expect(css).toContain('.sh-slideshow-content.fading');
    expect(css).toContain('opacity: 0');
  });
});
