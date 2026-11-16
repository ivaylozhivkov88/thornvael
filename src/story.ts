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
  readonly subtitle?: string;
  readonly triggerNode?: string;
  readonly completedNodeTrigger?: string;
  readonly slides: readonly StorySlide[];
}

export const STORY_SEQUENCES: readonly StorySequence[] = [
  {
    id: 'act-1',
    act: 1,
    kind: 'intro',
    title: 'Act I — The Border Fords',
    subtitle: 'The March across Thornvael Begins',
    triggerNode: 'm01-blood-at-the-ford',
    slides: [
      {
        id: 'a1-1',
        heading: 'Ash along the Border Road',
        caption: 'Black smoke coils above the swollen waters of the frontier. Outpost garrisons have been put to the torch, leaving only grim sentinels and desperate blades to guard the sunken timber crossings against the rising horde.',
        backdrop: '#2c3d29',
        cue: 'calm',
      },
      {
        id: 'a1-2',
        heading: 'The Gathering at Thornwick',
        caption: 'Weathered sellswords, stoic border rangers, and renegade arcanists assemble under the iron battlements of Thornwick. Bound by iron oaths and sovereign coin, your expedition prepares to march into the untamed abyss.',
        backdrop: '#384b32',
        cue: 'march',
      },
    ],
  },
  {
    id: 'act-2',
    act: 2,
    kind: 'intro',
    title: 'Act II — The Desiccated Marches',
    subtitle: 'Crossing the sunken mire into the scorching wastes',
    triggerNode: 'm12-redmarsh-border',
    completedNodeTrigger: 'm11-ashbrook-retreat',
    slides: [
      {
        id: 'a2-1',
        heading: 'The Drying Silt of Redmarsh',
        caption: 'The murky waters drain away, unearthing ancient bone fields and desecrated monoliths. A forgotten stone causeway cuts through the desolate salt flats beneath a merciless, copper sun.',
        backdrop: '#453528',
        cue: 'march',
      },
      {
        id: 'a2-2',
        heading: 'Threshold of the Scourged Wastes',
        caption: 'Gale winds carry stinging ash and the bitter stench of sulfur. Ruined watchtowers stand as hollow gravestones where two treacherous paths cleave through the suffocating dunes toward ancient buried evils.',
        backdrop: '#553f2f',
        cue: 'battle',
      },
    ],
  },
  {
    id: 'act-3',
    act: 3,
    kind: 'intro',
    title: 'Act III — Descent into the Sunless Deeps',
    subtitle: 'Plunging into the subterranean abysses beneath the Iron Coast',
    triggerNode: 'm24-pledge-at-oakhaven',
    completedNodeTrigger: 'm23-fork-of-spears',
    slides: [
      {
        id: 'a3-1',
        heading: 'Rifts of the Iron Coast',
        caption: 'Coastal citadels smolder under baleful witchfire, their black ramparts battered by churning tides. The only passage forward plunges into jagged, sunless chasms carved by primeval waters beneath the rock.',
        backdrop: '#243545',
        cue: 'march',
      },
      {
        id: 'a3-2',
        heading: 'The Sunless Catacombs',
        caption: 'The warmth of daylight perishes behind you. Damp stone passages resound with dragging runic chains and the chitinous skittering of horrors that have never beheld the sky.',
        backdrop: '#2d4154',
        cue: 'battle',
      },
    ],
  },
  {
    id: 'act-4',
    act: 4,
    kind: 'intro',
    title: 'Act IV — Gates of the Infernal Sanctuary',
    subtitle: 'The final struggle for the fate of Thornvael',
    triggerNode: 'm36-heartland-march',
    completedNodeTrigger: 'm35-burning-harbor',
    slides: [
      {
        id: 'a4-1',
        heading: 'The Ashen March to the Core',
        caption: 'The earth trembles in agony as the heavens weep molten rust. A shattered obsidian highway leads directly into the volcanic crater that cradles the Infernal Citadel.',
        backdrop: '#3c2529',
        cue: 'battle',
      },
      {
        id: 'a4-2',
        heading: 'The Threshold of Ruin',
        caption: 'Immense basalt gates loom above the chasm, radiating primordial malice and suffocating heat. Every heartbeat echoes like a funeral drum before the confrontation that will decide the realm.',
        backdrop: '#4a2b31',
        cue: 'battle',
      },
    ],
  },
  {
    id: 'ending-a',
    act: 4,
    kind: 'ending',
    title: 'Victory — The Purging of Thornvael',
    subtitle: 'Radiance triumphs over primordial darkness',
    triggerNode: 'm45-crown-of-order',
    slides: [
      {
        id: 'ea-1',
        heading: 'Fall of the Infernal Coven',
        caption: 'As the dread arch-warden falls, ancient runic wards shatter into gleaming dust. The suffocating pall of corruption lifts from the peaks of Thornvael as cleansing dawn sweeps across the land.',
        backdrop: '#2e4152',
        cue: 'triumph',
      },
      {
        id: 'ea-2',
        heading: 'Peace upon the Reborn Realm',
        caption: 'Golden light returns to emerald meadows and crystal streams. Battle-worn shields are mounted upon castle keeps, and ballads of your company will be sung across hearths for generations.',
        backdrop: '#384b36',
        cue: 'calm',
      },
    ],
  },
  {
    id: 'ending-b',
    act: 4,
    kind: 'ending',
    title: 'Alternative Ending — Rise of the Dark Sovereign',
    subtitle: 'A new dawn forged in embers and eternal shadow',
    triggerNode: 'm46-ember-reckoning',
    slides: [
      {
        id: 'eb-1',
        heading: 'Sundered Chains of the Ember',
        caption: 'The ancient altar shatters into blackened shards. The primordial fire is not banished, but bound irrevocably to your sovereign command, whispering secrets of forgotten dominion.',
        backdrop: '#522c24',
        cue: 'triumph',
      },
      {
        id: 'eb-2',
        heading: 'Ascension of the Dark Lord',
        caption: 'You ascend the throne of obsidian and iron. Standards of crimson and ash snap in the gale winds across the realm, and both man and monster bend their knee before their unquestioned master.',
        backdrop: '#4a3829',
        cue: 'march',
      },
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

export function actTransitionForCompletedNode(nodeId: string): StorySequence | null {
  return STORY_SEQUENCES.find((s) => s.completedNodeTrigger === nodeId) ?? null;
}

export function getActTransition(fromAct: 1 | 2 | 3, toAct: 2 | 3 | 4): StorySequence | undefined {
  if (fromAct === 1 && toAct === 2) return sequenceById('act-2');
  if (fromAct === 2 && toAct === 3) return sequenceById('act-3');
  if (fromAct === 3 && toAct === 4) return sequenceById('act-4');
  return undefined;
}

export function getEndingSequence(ending: 'victory' | 'alternative'): StorySequence {
  return sequenceById(ending === 'victory' ? 'ending-a' : 'ending-b');
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

export function previousStory(player: StoryPlayer): StoryPlayer {
  if (player.index > 0) {
    return { ...player, index: player.index - 1, finished: false };
  }
  return player;
}

export function skipStory(player: StoryPlayer): StoryPlayer {
  return { ...player, index: Math.max(0, player.sequence.slides.length - 1), finished: true };
}

export function replayStory(player: StoryPlayer): StoryPlayer {
  return { ...player, index: 0, finished: false, replays: player.replays + 1 };
}
