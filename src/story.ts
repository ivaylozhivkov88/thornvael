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
    subtitle: 'The Iron Coast, The Drowned Citadel & The Rearguard of Burning Harbor',
    triggerNode: 'm24-pledge-at-oakhaven',
    completedNodeTrigger: 'm23-fork-of-spears',
    slides: [
      {
        id: 'a3-1',
        heading: 'The Dry Cisterns & The Road to Oakhaven',
        caption: 'Behind the forked ridge of Ironheart, Gorrathul’s mountain cisterns stood revealed as dry red silt—a fifty-year mirage kept alive at spearpoint. Turning west from the salt wastes, your column descends through towering ironwood groves toward Oakhaven and Harborwatch, where Harbor Marshal Veyra and Master Shipwright Kors race against tectonic tremors to hammer together the last evacuation caravels.',
        backdrop: '#223344',
        cue: 'march',
        reflection: '“When a continent catches fire, men run to the sea. But every hull has a waterline—and not everyone on the pier will ever board a ship.”',
      },
      {
        id: 'a3-2',
        heading: 'The Rearguard of the Iron Coast',
        caption: 'Storm-lashed cliffs ring the sunless sea-caves of the Drowned Citadel and the roaring riverlocks above Harborwatch. Between predatory warbands tearing at each other for boarding manifests and the primeval Elder Juggernaut stirring in tectonic agony, Chief Healer Sera tends the broken in the glade while you stand as the Shield of the Departing—buying every minute of hull-caulking in blood.',
        backdrop: '#2b3e50',
        cue: 'battle',
        reflection: '“Hold the riverlocks, hold the infirmary, hold the final pier. We do not fight for gold anymore; we fight so their sails clear the rim.”',
      },
    ],
  },
  {
    id: 'act-4',
    act: 4,
    kind: 'intro',
    title: 'Act IV — Gates of the Infernal Sanctuary',
    subtitle: 'The Obsidian Caldera & The Reckoning of Will',
    triggerNode: 'm36-heartland-march',
    completedNodeTrigger: 'm35-burning-harbor',
    slides: [
      {
        id: 'a4-1',
        heading: 'The Empty Slipways & The Obsidian Caldera',
        caption: 'Behind Harborwatch’s scorched breakwater, the white sails of the evacuation armada shrink into pinpricks against the western mist—safe beyond the rim. Turning your back on the ocean beside Marshal Veyra and Marshal Vance, you march fifty leagues east along the cracked basalt highway into the Obsidian Caldera, where the Iron Pact fortifies the Infernal Sanctuary above rivers of white-hot slag.',
        backdrop: '#3d2328',
        cue: 'battle',
        reflection: '“The fleet has sailed. Their dawn is on the water. We have bought them their morning—now let us march into the night.”',
      },
      {
        id: 'a4-2',
        heading: 'Highcrest Citadel & The Threshold of Will',
        caption: 'At Highcrest Citadel, Archivist Orla decodes the final ledgers linking Morvessa’s northern Salt Tithe to the Iron Pact’s treason, while Weaponsmith Elda tempers meteoric steel against volcanic ash. Beyond Greystone Bastion, Ashveil Gorge, and the Gauntlet of Iron waits the Threshold Chamber—where Arch-Warden Korrath’s petrified law and Ember Overlord Vorak’s living kiln demand an answer: what deserves to rise from the ashes of a dying world?',
        backdrop: '#4c2830',
        cue: 'battle',
        reflection: '“No one left is asking us to hold a bridge. At the furnace heart of the earth, we decide who holds the right to name the dawn.”',
      },
    ],
  },
  {
    id: 'ending-a',
    act: 4,
    kind: 'ending',
    title: 'Victory — The Purging of Thornvael',
    subtitle: 'Path of Order: Breaking the Petrified Law',
    triggerNode: 'm45-crown-of-order',
    slides: [
      {
        id: 'ea-1',
        heading: 'Shattering of the Necrotic Core',
        caption: 'With a resonant chime of sundered granite, Arch-Warden Korrath dissolves into harmless gray dust inside the Crown Vault. The twin resonance anchors detonate in a silent cascade of blinding solar fire, snapping the necrotic tether that choked the Obsidian Caldera. Rivers of molten slag freeze instantly into still black basalt as cold, clean mountain air rushes through the peaks, purging centuries of volcanic rot.',
        backdrop: '#2a3d4e',
        cue: 'triumph',
        reflection: '“The nightmare is broken. Our hands are stained with ash, and we paid for this morning with friends who will never see it—but the sky, for the first time in an age, is blue.”',
      },
      {
        id: 'ea-2',
        heading: 'Dawn upon the Reclaimed Realm',
        caption: 'Golden morning light spills across the emerald hills of Thornwick and the healing shallows of the Border Fords. Far to the west, the returning sails of the evacuation armada catch a clean breeze, turning homeward toward a shore that no longer burns. Notched swords and dented shields hang above rebuilding hearths—and the quiet saga of the rearguard who stayed behind to buy the world another morning echoes through generations of hard-won peace.',
        backdrop: '#354832',
        cue: 'calm',
        reflection: '“The empire was stone and silence; the dawn is scarred, imperfect, and free. Let a living world learn how to keep it.”',
      },
    ],
  },
  {
    id: 'ending-b',
    act: 4,
    kind: 'ending',
    title: 'Alternative Ending — Rise of the Dark Sovereign',
    subtitle: 'Path of Ember: The Crown of Thorns and Cinder',
    triggerNode: 'm46-ember-reckoning',
    slides: [
      {
        id: 'eb-1',
        heading: 'Claiming the Crown of Thorns and Cinder',
        caption: 'Ember Overlord Vorak sinks beneath the boiling magma of the Furnace Heart, yet the primeval flame does not die—it waits. Remembering Morvessa’s ruthless ledgers, Gorrathul’s dry cisterns, and the burning piers of Harborwatch, you step into the roaring heat of the obsidian altar and lift the Crown of Thorns and Cinder. Burning iron fuses to brow and bone as fathomless eldritch fire bends every leyline of Thornvael to one unbreakable sovereign will.',
        backdrop: '#502820',
        cue: 'triumph',
        reflection: '“We watched tax collectors starve the North, watched a titan guard an empty well, and watched cities burn on the pier. Never again.”',
      },
      {
        id: 'eb-2',
        heading: 'The Iron Throne of the New Age',
        caption: 'Standards of crimson velvet and smoking steel rise over every stronghold from the Border Fords to the Obsidian Peaks. The Caldera obeys its new master, sealing its fissures into an impregnable fortress of black glass. Man, beast, and risen dead kneel in hushed, terrified awe before the Sovereign of Embers and Shadow—pacifying Thornvael at last under an iron dominion that will never falter, never bleed, and never fall.',
        backdrop: '#463424',
        cue: 'march',
        reflection: '“Let them call it tyranny. Beneath the peace of steel and cinder, no storm, no traitor, and no god will ever break these borders again.”',
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

// Re-export complete narrative continuity module (Acts I-IV complete story flags, dialogue scenes, barks, hub evolution)
export * from './story-complete';

