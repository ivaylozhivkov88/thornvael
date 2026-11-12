/** Story presentation data and slideshow playback state for Acts I–IV and endings A/B (P22). */

export interface StorySlide {
  readonly id: string;
  readonly heading: string;
  readonly caption: string;
  readonly backdrop: string;
  readonly cue: 'calm' | 'march' | 'battle' | 'triumph';
}

export interface StorySequence {
  readonly id: 'act-1' | 'act-2' | 'act-3' | 'act-4' | 'ending-a' | 'ending-b';
  readonly act: 1 | 2 | 3 | 4;
  readonly kind: 'intro' | 'ending';
  readonly title: string;
  readonly triggerNode?: string;
  readonly slides: readonly StorySlide[];
}

export const STORY_SEQUENCES: readonly StorySequence[] = [
  {
    id: 'act-1',
    act: 1,
    kind: 'intro',
    title: 'Act I — The Border Fords',
    triggerNode: 'm01-blood-at-the-ford',
    slides: [
      { id: 'a1-1', heading: 'Ash on the Toll Road', caption: 'Smoke rises along the border rivers where frontier scouts hold the last wooden crossings.', backdrop: '#2c3d29', cue: 'calm' },
      { id: 'a1-2', heading: 'The Muster at Thornwick', caption: 'Swords for hire and hedge mages gather in the market square before the highland raids.', backdrop: '#384b32', cue: 'march' },
    ],
  },
  {
    id: 'act-2',
    act: 2,
    kind: 'intro',
    title: 'Act II — Into the Redmarsh',
    triggerNode: 'm12-redmarsh-border',
    slides: [
      { id: 'a2-1', heading: 'Beyond the Watchtowers', caption: 'Beneath the sunken vaults lie older boundary stones linking the fens to the stone quarries.', backdrop: '#453528', cue: 'march' },
      { id: 'a2-2', heading: 'Two Passes South', caption: 'Every bridge and ridge post now carries banners from rival warbands converging on the plateau.', backdrop: '#553f2f', cue: 'battle' },
    ],
  },
  {
    id: 'act-3',
    act: 3,
    kind: 'intro',
    title: 'Act III — The Iron Coast',
    triggerNode: 'm24-pledge-at-oakhaven',
    slides: [
      { id: 'a3-1', heading: 'Harbors Under Wardfire', caption: 'Alchemical beacons flare above the river locks as coastal fortresses seal their gates.', backdrop: '#243545', cue: 'march' },
      { id: 'a3-2', heading: 'The Breaker of Walls', caption: 'Only a seasoned company can pierce the rune perimeters and rescue the trapped garrisons.', backdrop: '#2d4154', cue: 'battle' },
    ],
  },
  {
    id: 'act-4',
    act: 4,
    kind: 'intro',
    title: 'Act IV — Crown and Ember',
    triggerNode: 'm36-heartland-march',
    slides: [
      { id: 'a4-1', heading: 'Heartland Ascent', caption: 'Three roads climb toward the central citadel where the ancient vault wards still pulse.', backdrop: '#3c2529', cue: 'battle' },
      { id: 'a4-2', heading: 'At the Threshold', caption: 'When the outer ramparts fall, your company must choose whether to seal the vault or break it open.', backdrop: '#4a2b31', cue: 'battle' },
    ],
  },
  {
    id: 'ending-a',
    act: 4,
    kind: 'ending',
    title: 'Ending A — The Crown of Order',
    triggerNode: 'm45-crown-of-order',
    slides: [
      { id: 'ea-1', heading: 'The Vault Sealed', caption: 'With the arch-warden defeated, the heavy iron rings lock the core beneath Thornvael once more.', backdrop: '#2e4152', cue: 'triumph' },
      { id: 'ea-2', heading: 'Quiet Roads', caption: 'Mercenaries hang up their shields in Thornwick while border lanterns burn steadily through the autumn mist.', backdrop: '#384b36', cue: 'calm' },
    ],
  },
  {
    id: 'ending-b',
    act: 4,
    kind: 'ending',
    title: 'Ending B — The Ember Reckoning',
    triggerNode: 'm46-ember-reckoning',
    slides: [
      { id: 'eb-1', heading: 'Shattered Chains', caption: 'You break the ancient seal and scatter the ember overlord across the high plateau.', backdrop: '#522c24', cue: 'triumph' },
      { id: 'eb-2', heading: 'An Unbound Horizon', caption: 'Magic surges untamed into the highlands; the frontier towns rebuild under a brighter, wilder sky.', backdrop: '#4a3829', cue: 'march' },
    ],
  },
];

export interface StoryPlayer {
  readonly sequence: StorySequence;
  index: number;
  finished: boolean;
  replays: number;
}

export function sequenceById(id: StorySequence['id']): StorySequence {
  const found = STORY_SEQUENCES.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown story sequence: ${id}`);
  return found;
}

export function sequenceForNode(nodeId: string): StorySequence | null {
  return STORY_SEQUENCES.find((s) => s.triggerNode === nodeId) ?? null;
}

export function openStory(id: StorySequence['id']): StoryPlayer {
  return { sequence: sequenceById(id), index: 0, finished: false, replays: 0 };
}

export function advanceStory(player: StoryPlayer): StoryPlayer {
  if (player.finished) return player;
  if (player.index + 1 < player.sequence.slides.length) {
    return { ...player, index: player.index + 1 };
  }
  return { ...player, finished: true };
}

export function skipStory(player: StoryPlayer): StoryPlayer {
  return { ...player, index: Math.max(0, player.sequence.slides.length - 1), finished: true };
}

export function replayStory(player: StoryPlayer): StoryPlayer {
  return { ...player, index: 0, finished: false, replays: player.replays + 1 };
}
