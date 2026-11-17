/** Story presentation data and slideshow playback state for Acts I–IV and endings A/B (P22). */

export interface StorySlide {
  readonly id: string;
  readonly heading: string;
  readonly caption: string;
  readonly backdrop: string;
  readonly cue: 'calm' | 'march' | 'battle' | 'triumph';
  readonly reflection?: string;
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
        heading: 'Funeral Pyres along the Border Fords',
        caption: 'Cold, relentless rain lashes the swollen timber crossings of the frontier, washing soot and viscera into the gray rapids. Frontier watchtowers have burned to blackened stumps, their halberdiers butchered where they stood by howling gnoll war-packs. As iron crows wheel over the mire, your veterans tighten their harness—beyond these shallows lies a frontier forsaken by the gods.',
        backdrop: '#2a3826',
        cue: 'calm',
        reflection: '“Steel remembers what bone forgets: on this border, mercy is only a slower way to bleed.”',
      },
      {
        id: 'a1-2',
        heading: 'The Iron Covenant of Thornwick',
        caption: 'Behind the soot-blackened bastions of Thornwick Keep, scarred sellswords, hooded border rangers, and renegade battle-mages huddle over iron braziers. Gold cannot resurrect the dead, yet the Imperial writ is stamped in crimson wax: force the sunken crossings, cleave through the highland horde, and purge the ancient evil awakening in the dark.',
        backdrop: '#364730',
        cue: 'march',
        reflection: '“Twelve blades against a wilderness of fangs. If we break, the bells of Thornwick toll for an empty keep.”',
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
        heading: 'The Bone Causeway of Redmarsh',
        caption: 'The brackish swamps recede into cracked salt flats littered with the calcified ribcages of primeval beasts. A forgotten imperial highway cuts through the alkaline silt, its runic mile-markers chipped and stained by blood-cultists. Above, a merciless copper sun hangs like an open furnace, baking the dead and drawing venomous things from subterranean fissures.',
        backdrop: '#463628',
        cue: 'march',
        reflection: '“The salt bites at cracked lips and rusted mail alike. Out here, even water tastes of ash and ancient slaughter.”',
      },
      {
        id: 'a2-2',
        heading: 'The Furnace Winds of the Dune Sea',
        caption: 'Gales of stinging quartz and sulfur howl between cyclopean basalt pillars that once held back the underworld. Across the shifting dunes, dune scourges and burrowing abominations stalk the column, drawn by the thrum of desecrated elemental shrines. Two sunken passes pierce the canyon wall—each flanked by weeping effigies of forgotten kings.',
        backdrop: '#56402e',
        cue: 'battle',
        reflection: '“The dunes bury crowns and beggars without distinction. Keep your shields locked; the wind itself carries teeth.”',
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
        heading: 'The Drowned Bastions of the Iron Coast',
        caption: 'Black basalt ramparts crumble into boiling ocean foam under the sickly glare of spectral witchfire. The sky above is an iron shroud, torn by ceaseless thunder that drowns the death-rattle of fallen garrison cohorts. With the surface roads severed by abyssal fissures, the only path forward plunges straight into the yawning gullet of the earth.',
        backdrop: '#223344',
        cue: 'march',
        reflection: '“The ocean roars above our helms like an unsealed tomb. Beyond this threshold, no sunbeam will ever find our bones.”',
      },
      {
        id: 'a3-2',
        heading: 'The Chittering Vaults of the Abyss',
        caption: 'The last warmth of daylight withers behind granite collapse-gates. In the damp subterranean darkness, runic chains groan under primeval strain and blind chitinous broods scuttle across bone-choked stalagmites. Deep in the gloom, elder monoliths thrum with the pulse of an awakened necromantic heart, commanding all dead things to rise.',
        backdrop: '#2b3e50',
        cue: 'battle',
        reflection: '“The darkness here is living; it listens to our footfalls and calculates the hour of our butchery.”',
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
        heading: 'The Obsidian Caldera & Rivers of Slag',
        caption: 'The continental bedrock groans in agony as rivers of white-hot slag tear through shattered obsidian highways. Choking cinder-clouds bleed crimson ash over jagged mountain spires. At the caldera center looms the Infernal Citadel—an iron monolith erected upon the chained marrow of elder titans, radiating primordial malice.',
        backdrop: '#3d2328',
        cue: 'battle',
        reflection: '“We march across molten glass. Every breath scorches the lungs, but our blades remain colder than the grave.”',
      },
      {
        id: 'a4-2',
        heading: 'The Threshold of the Arch-Warden',
        caption: 'Colossal gates forged of meteoric iron and screaming souls bar the inner sanctum. Primordial dread coils through the air like suffocating fumes; the war-drums of the final legion echo from the caldera ribcage. There is no retreat, no parley, and no dawn left to wait for—only steel and sorcery to determine whether Thornvael survives or burns.',
        backdrop: '#4c2830',
        cue: 'battle',
        reflection: '“Let the heavens crack. If this is the twilight of our world, we will carve our epitaph into the enemy\'s throne.”',
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
        heading: 'Shattering of the Obsidian Core',
        caption: 'With a deafening shriek of sundered iron, the Arch-Warden crumbles into dissolving cinders. Corrupted runic pylons detonate in cascades of blinding solar flame, snapping the necrotic tether that choked the continent. Molten fissures freeze into harmless basalt as cleansing winds sweep through the caldera, purging centuries of rot.',
        backdrop: '#2a3d4e',
        cue: 'triumph',
        reflection: '“The nightmare is broken. Our hands are stained with ash, but the sky—for the first time in an age—is blue.”',
      },
      {
        id: 'ea-2',
        heading: 'Dawn upon the Reclaimed Realm',
        caption: 'Golden morning light crowns the emerald ridges of Thornwick and the healing waters of the Border Fords. The bells of the fortress ring out across valleys once choked in funeral pyres. Weathered swords and notched shields are hung above the hearth-fires of rebuilding settlements, and the saga of the Twelve will echo for generations.',
        backdrop: '#354832',
        cue: 'calm',
        reflection: '“We buried our brothers in the salt and ash. In their sacrifice, the ramparts of the realm stand unbroken.”',
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
        heading: 'The Sundered Altar of Embers',
        caption: 'The Arch-Warden lies in his own gore, but the primeval flame does not die—it hungers. As you reach into the screaming heart of the obsidian altar, the ancient crown of thorns and cinder fuses with your flesh. Unfathomable eldritch power surges through your blood, bending the leylines of Thornvael to your absolute, sovereign will.',
        backdrop: '#502820',
        cue: 'triumph',
        reflection: '“Why bow to a shattered empire when one can forge order from the furnace of eternity?”',
      },
      {
        id: 'eb-2',
        heading: 'The Iron Throne of the New Age',
        caption: 'Standards of crimson velvet and smoking steel rise atop every keep from the Border Fords to the obsidian peaks. Man, beast, and risen dead bow in terrified awe before the Sovereign of Embers and Shadow. The world is pacified at last—not through fragile prayers, but through an iron dominion that will never falter, never bleed, and never fall.',
        backdrop: '#463424',
        cue: 'march',
        reflection: '“Let them call it tyranny. In the peace of the grave and the rule of steel, no enemy will ever cross these borders again.”',
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
