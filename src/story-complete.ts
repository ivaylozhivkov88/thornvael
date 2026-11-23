/**
 * THORNVAEL — COMPLETE NARRATIVE & CONTINUITY MODULE (ACTS I–IV)
 * Ready for integration with src/story.ts, src/campaign.ts, and src/townui.ts.
 *
 * UI Constraints respected:
 * - Dialogue lines: 2–3 sentences (~30–55 words) for clean desktop & mobile (100dvh) fit.
 * - Combat barks: Short floating text synced with 4.5s cooldown audio system.
 * - Story slides: Full-screen art with title, subtitle, poetic caption, and italic reflection.
 */

export type ActId = 1 | 2 | 3 | 4;
export type EndingBranch = 'order' | 'ember';

export interface StoryFlags {
  // Act I — The Border Fords & Weeping Ossuary
  hasMorvessaRing: boolean;
  sparedRavenwatchTraitor: boolean;
  donatedGalleryFourSilver: boolean;
  returnedVelenMedallion: boolean;
  canceledTobinsLien: boolean;

  // Act II — The Redmarsh Wastes & Ironheart Cisterns
  cleansedQuartzWardstones: boolean;
  evacuatedQuarryMiners: boolean;
  redeemedThirdDynastyDebt: boolean;

  // Act III — The Iron Coast & Drowned Citadel
  rescuedTidalShipwrights: boolean;
  executedMutineerCaptain: boolean;
  allEvacuationShipsSailed: boolean;

  // Act IV — Gates of the Infernal Sanctuary
  chosenBranch: EndingBranch | null;
}

export const DEFAULT_STORY_FLAGS: StoryFlags = {
  hasMorvessaRing: false,
  sparedRavenwatchTraitor: false,
  donatedGalleryFourSilver: false,
  returnedVelenMedallion: false,
  canceledTobinsLien: false,
  cleansedQuartzWardstones: false,
  evacuatedQuarryMiners: false,
  redeemedThirdDynastyDebt: false,
  rescuedTidalShipwrights: false,
  executedMutineerCaptain: false,
  allEvacuationShipsSailed: false,
  chosenBranch: null,
};

export interface StorySlide {
  id: string;
  act: ActId;
  trigger: 'act_start' | 'act_end' | 'ending_order' | 'ending_ember';
  artId: string;
  title: string;
  subtitle: string;
  caption: string;
  reflection: string;
  voiceId?: string;
}

export interface DialogueLine {
  id: string;
  who: string;
  portrait: string;
  text: string;
  voiceId?: string;
  requiresFlag?: keyof StoryFlags;
  forbidsFlag?: keyof StoryFlags;
}

export interface MissionDialogueScene {
  sceneId: string;
  missionId: string;
  act: ActId;
  trigger: 'start' | 'mid' | 'boss_intro' | 'boss_phase2' | 'boss_death' | 'end';
  lines: DialogueLine[];
}

export interface CombatBark {
  id: string;
  speaker: string;
  trigger: 'aggro' | 'phase2' | 'ability' | 'low_hp' | 'death';
  text: string;
  voiceId?: string;
}

export interface HubEvolutionStage {
  act: ActId;
  hubId: string;
  hubName: string;
  afterMission: string;
  visualFilter: string;
  particles: 'rain' | 'ash_light' | 'alkali_storm' | 'clear_heat' | 'sea_spray' | 'embers' | 'cinder_snow';
  townDescription: string;
  ambientNote: string;
  unlockedMercenary?: string;
}

// ============================================================================
// 1. STORY SLIDES (CUTSCENES FOR ALL 4 ACTS & DUAL ENDINGS)
// ============================================================================

export const STORY_SLIDES: StorySlide[] = [
  // --- ACT I ---
  {
    id: 'act1_intro',
    act: 1,
    trigger: 'act_start',
    artId: 'slide_act1_thornwick_rain',
    title: 'ACT I: THE LEDGER OF SALT AND ASH',
    subtitle: 'The Border Fords & Weeping Ossuary',
    caption:
      'Cold rain falls without mercy over the Alder River. Under the pretext of an imperial Salt Tithe, High Quartermaster Morvessa has stripped the northern parishes of grain, iron, and silver—while gnoll warbands gather across the sunken fords.',
    reflection:
      'Evil rarely wears horns. More often it wears a silk cloak, carries a brass abacus, and keeps an immaculate ledger.',
    voiceId: 'cs_act1_start_01_narrator',
  },
  {
    id: 'act1_outro',
    act: 1,
    trigger: 'act_end',
    artId: 'slide_act1_ashbrook_gate',
    title: 'ACT I COMPLETE',
    subtitle: 'The Threshold of Ashbrook Gate',
    caption:
      'The iron doors of Ashbrook groan open. Behind you lies the wet, bleeding North—free from the tithe, yet shadowed by Morvessa’s dying warning. Ahead, the sky burns the color of old rust above the Redmarsh Wastes.',
    reflection:
      'The North is free. Yet as the warm sulfur wind strikes my face, I wonder if I just killed the only soul who had a plan to stop the fire.',
    voiceId: 'cs_act1_end_06_hero',
  },

  // --- ACT II ---
  {
    id: 'act2_intro',
    act: 2,
    trigger: 'act_start',
    artId: 'slide_act2_redmarsh_stilts',
    title: 'ACT II: THE MIRAGE OF THE SILTED WELL',
    subtitle: 'The Redmarsh Wastes & Ironheart Cisterns',
    caption:
      'Perched on limestone stilts above boiling alkali mud, Redmarsh Outpost survives on a single fragile myth: that the glacial cisterns of Ironheart Mountain still hold enough fresh water to carry the realm through the Caldera’s wrath.',
    reflection:
      'A man dying of thirst will cross a thousand leagues of salt for a promise. We march south not on bread, but on rumor.',
    voiceId: 'cs_act2_start_06_hero',
  },
  {
    id: 'act2_outro',
    act: 2,
    trigger: 'act_end',
    artId: 'slide_act2_dry_cistern',
    title: 'ACT II COMPLETE',
    subtitle: 'The Empty Mountain',
    caption:
      'The great iron sluice-gates groan open onto a subterranean cathedral engineered for three million barrels of glacial water. Instead, dry wind whistles across a silent canyon of cracked red silt—the glaciers died fifty years ago.',
    reflection: 'The well is dry. The road leads to the sea.',
    voiceId: 'cs_act2_end_06_narrator',
  },

  // --- ACT III ---
  {
    id: 'act3_intro',
    act: 3,
    trigger: 'act_start',
    artId: 'slide_act3_oakhaven_cliffs',
    title: 'ACT III: THE IRON COAST & THE DROWNED CITADEL',
    subtitle: 'Oakhaven & Harborwatch War-Docks',
    caption:
      'Thornvael cannot be saved from within. Along the storm-battered cliffs of Oakhaven and the granite piers of Harborwatch, the last timber fleets are rigging for exodus—while rival warbands and awakened stone titans close in.',
    reflection:
      'When a continent catches fire, men run to the sea. There is never enough timber for all of us—only enough steel to buy them time.',
    voiceId: 'cs_act3_start_01_narrator',
  },
  {
    id: 'act3_outro',
    act: 3,
    trigger: 'act_end',
    artId: 'slide_act3_burning_harbor',
    title: 'ACT III COMPLETE',
    subtitle: 'The Fleet Has Sailed',
    caption:
      'White sails vanish into the western mist, carrying Thornvael’s children and memory beyond the rim. On the bloodstained flagstones of Harborwatch, you turn your back to the sea and face the incandescent violet pillar tearing open the eastern sky.',
    reflection:
      'We have given them their dawn. Now, before the Caldera boils the ocean itself, we march into the night.',
    voiceId: 'cs_act3_end_06_hero',
  },

  // --- ACT IV ---
  {
    id: 'act4_intro',
    act: 4,
    trigger: 'act_start',
    artId: 'slide_act4_highcrest_spire',
    title: 'ACT IV: GATES OF THE INFERNAL SANCTUARY',
    subtitle: 'The Obsidian Caldera & The Crown of Embers',
    caption:
      'High above the volcanic plateau, Highcrest Citadel stands as the final bastion of the rearguard. Ahead, the fanatics of the Iron Pact guard the ancient Crown Vault—waiting to decide what rises from the ashes of a dying world.',
    reflection:
      'No refugees remain behind us. What waits inside the Caldera is no longer a battle for survival—it is a reckoning of will.',
    voiceId: 'cs_act4_start_06_hero',
  },
  {
    id: 'ending_order',
    act: 4,
    trigger: 'ending_order',
    artId: 'slide_ending_a_purging',
    title: 'ENDING: THE PURGING OF THORNVAEL',
    subtitle: 'Path of Order — The Reclaimed Dawn',
    caption:
      'With a chime of sundered granite, the necrotic tether snaps. Molten fissures cool into harmless black basalt as clean mountain winds sweep the Caldera, and far to the west, the returning sails of the fleet turn homeward.',
    reflection:
      'The nightmare is broken. Our hands are stained with ash, but the sky—for the first time in an age—is blue.',
    voiceId: 'cs_ending_order_01_narrator',
  },
  {
    id: 'ending_ember',
    act: 4,
    trigger: 'ending_ember',
    artId: 'slide_ending_b_sovereign',
    title: 'ENDING: RISE OF THE DARK SOVEREIGN',
    subtitle: 'Path of Ember — The Iron Dominion',
    caption:
      'Vorak sinks into the magma, yet the Crown of Thorns and Cinder waits upon the obsidian altar. Lifting it, the hero bends every leyline of the continent to a single, unbreakable sovereign will.',
    reflection:
      'Let them call it tyranny. Beneath the rule of steel and cinder, no storm, no traitor, and no god will ever break these borders again.',
    voiceId: 'cs_ending_ember_01_narrator',
  },
];

// ============================================================================
// 2. KEY IN-MISSION DIALOGUES (STRICTLY 2–3 SENTENCES PER BOX)
// ============================================================================

export const MISSION_DIALOGUES: MissionDialogueScene[] = [
  // ---------------- ACT I ----------------
  {
    sceneId: 'mq1_01_groktar_intro',
    missionId: 'MQ1-01',
    act: 1,
    trigger: 'boss_intro',
    lines: [
      {
        id: 'mq1_01_l1',
        who: "Chieftain Grok'tar",
        portrait: 'portrait_groktar',
        text: 'Fresh-minted copper from your own southern kilns! The Silk Lady pays well so northerners never read their own ledgers.',
        voiceId: 'vo_act1_groktar_01',
      },
      {
        id: 'mq1_01_l2',
        who: 'Commander',
        portrait: 'portrait_hero',
        text: 'The Border Mint was burned from the inside. Drop the ledger, beast—we are taking those accounts back to Thornwick.',
        voiceId: 'vo_act1_hero_01',
      },
    ],
  },
  {
    sceneId: 'mq1_04_morvessa_intro',
    missionId: 'MQ1-04',
    act: 1,
    trigger: 'boss_intro',
    lines: [
      {
        id: 'mq1_04_l1',
        who: 'High Quartermaster Morvessa',
        portrait: 'portrait_morvessa',
        text: 'You see starving villagers, borderer. I see ten thousand souls who must perish today so a million do not burn when the Caldera seals fail.',
        voiceId: 'vo_act1_morvessa_01',
      },
      {
        id: 'mq1_04_l2',
        who: 'Commander',
        portrait: 'portrait_hero',
        text: 'You drowned refugees in Fenwick Peat to save whale oil, Morvessa. No apocalypse excuses a butcher hiding behind an abacus.',
        voiceId: 'vo_act1_hero_02',
      },
      {
        id: 'mq1_04_l3',
        who: 'High Quartermaster Morvessa',
        portrait: 'portrait_morvessa',
        text: 'Then step onto the balance, little soldier. Let us see how much your mercy weighs against the fire of the South.',
        voiceId: 'vo_act1_morvessa_02',
      },
    ],
  },
  {
    sceneId: 'mq1_04_morvessa_death',
    missionId: 'MQ1-04',
    act: 1,
    trigger: 'boss_death',
    lines: [
      {
        id: 'mq1_04_d1',
        who: 'High Quartermaster Morvessa',
        portrait: 'portrait_morvessa',
        text: 'Take my signet ring. You are the auditor now—see how clean your hands remain once you cross Ashbrook Gate.',
        voiceId: 'vo_act1_morvessa_death',
      },
    ],
  },
  {
    sceneId: 'mq1_06_velen_twins',
    missionId: 'MQ1-06',
    act: 1,
    trigger: 'boss_intro',
    lines: [
      {
        id: 'mq1_06_l1',
        who: 'Siege Commander Velen',
        portrait: 'portrait_commander_velen',
        text: 'Did my brother send you, borderer? Vaelen still hides behind dusty books in Thornwick while the South builds the walls that might save us.',
        voiceId: 'vo_act1_velen_01',
      },
      {
        id: 'mq1_06_l2',
        who: 'Captain Garrick',
        portrait: 'portrait_garrick',
        text: 'Do not listen to him, Commander! Break his siege line and open Ashbrook Gate before the whole garrison bleeds out!',
        voiceId: 'vo_act1_garrick_01',
      },
    ],
  },

  // ---------------- ACT II ----------------
  {
    sceneId: 'mq2_02_twin_passes_intel',
    missionId: 'MQ2-02',
    act: 2,
    trigger: 'start',
    lines: [
      {
        id: 'mq2_02_l1',
        who: 'Sabik the Sand-Walker',
        portrait: 'portrait_sabik',
        text: 'Hornbow blinds line the central chimney spire. March straight into either ravine and the Sand-Clan will pin you to the sandstone.',
        voiceId: 'vo_act2_sabik_01',
      },
      {
        id: 'mq2_02_l2_traitor',
        who: 'Exiled Ravenwatch Guard',
        portrait: 'portrait_levyman',
        text: 'Wait—Commander! You spared my neck at Ravenwatch. Take this side-scree path behind their blinds; consider my debt paid in full.',
        voiceId: 'vo_act2_exile_01',
        requiresFlag: 'sparedRavenwatchTraitor',
      },
    ],
  },
  {
    sceneId: 'mq2_04_quarry_revolt',
    missionId: 'MQ2-04',
    act: 2,
    trigger: 'mid',
    lines: [
      {
        id: 'mq2_04_l1',
        who: 'Miner Gorin',
        portrait: 'portrait_gorin',
        text: 'The lower shafts are packed with northern debtors! Give us three minutes to clear the ladders before you blow the bronze sluice!',
        voiceId: 'vo_act2_gorin_01',
      },
      {
        id: 'mq2_04_l2',
        who: 'Commander',
        portrait: 'portrait_hero',
        text: 'Hold the terraces! We flood the imperial quarry only when the last chained man is out of the pit!',
        voiceId: 'vo_act2_hero_01',
      },
    ],
  },
  {
    sceneId: 'mq2_06_gorrathul_intro',
    missionId: 'MQ2-06',
    act: 2,
    trigger: 'boss_intro',
    lines: [
      {
        id: 'mq2_06_l1',
        who: 'Gorrathul, the Sand Glutton',
        portrait: 'portrait_gorrathul',
        text: 'Turn back into the alkali dust, little insects. As long as these gates stay shut, the fools in the valley still believe tomorrow exists.',
        voiceId: 'vo_act2_gorrathul_01',
      },
      {
        id: 'mq2_06_l2_ring',
        who: 'Gorrathul, the Sand Glutton',
        portrait: 'portrait_gorrathul',
        text: 'Wait... you wear Morvessa’s Signet. Then you already know how heavy a necessary lie can be—yet still you come to break mine.',
        voiceId: 'vo_act2_gorrathul_ring',
        requiresFlag: 'hasMorvessaRing',
      },
      {
        id: 'mq2_06_l3',
        who: 'Commander',
        portrait: 'portrait_hero',
        text: 'People are dying of thirst outside your doors, titan. Step aside or freeze in your own armor.',
        voiceId: 'vo_act2_hero_02',
      },
    ],
  },
  {
    sceneId: 'mq2_06_gorrathul_death',
    missionId: 'MQ2-06',
    act: 2,
    trigger: 'boss_death',
    lines: [
      {
        id: 'mq2_06_d1',
        who: 'Gorrathul, the Sand Glutton',
        portrait: 'portrait_gorrathul',
        text: 'You broke the door... now go look upon your salvation, fools. Drink your fill of red silt and silence.',
        voiceId: 'vo_act2_gorrathul_death',
      },
      {
        id: 'mq2_06_d2',
        who: 'Chronicler Zahra',
        portrait: 'portrait_zahra',
        text: 'By the Light... the cisterns have been dry for fifty years. Commander, look through the mountain gap—our only hope lies with the fleet at Oakhaven.',
        voiceId: 'vo_act2_zahra_02',
      },
    ],
  },

  // ---------------- ACT III ----------------
  {
    sceneId: 'm27_sera_stand',
    missionId: 'm27',
    act: 3,
    trigger: 'start',
    lines: [
      {
        id: 'm27_l1',
        who: 'Chief Healer Sera',
        portrait: 'portrait_sera',
        text: 'If I step back one pace, these wounded men die in their bandages. Hold the glade perimeter until the last stretcher clears the road!',
        voiceId: 'vo_act3_sera_01',
      },
      {
        id: 'm27_l2',
        who: 'Commander',
        portrait: 'portrait_hero',
        text: 'Not one raider touches the tents, Sera. Form shields around the glade!',
        voiceId: 'vo_act3_hero_01',
      },
    ],
  },
  {
    sceneId: 'm35_burning_harbor_intro',
    missionId: 'm35',
    act: 3,
    trigger: 'start',
    lines: [
      {
        id: 'm35_l1',
        who: 'Harbor Marshal Veyra',
        portrait: 'portrait_veyra',
        text: 'The sky is bleeding ash and Korvus has breached the eastern seawall! Hold the Western Pier until the last refugee caravel clears the chain!',
        voiceId: 'vo_act3_veyra_01',
      },
      {
        id: 'm35_l2_thornwick',
        who: 'Harbor Marshal Veyra',
        portrait: 'portrait_veyra',
        text: 'The families from Thornwick just made it aboard the final hull—your silver kept them alive long enough to reach my docks. Now buy them the wind!',
        voiceId: 'vo_act3_veyra_thornwick',
        requiresFlag: 'donatedGalleryFourSilver',
      },
    ],
  },
  {
    sceneId: 'm35_korvus_duel',
    missionId: 'm35',
    act: 3,
    trigger: 'boss_intro',
    lines: [
      {
        id: 'm35_k1',
        who: 'Lord-Captain Korvus',
        portrait: 'portrait_korvus',
        text: 'Why let the cowards sail away into the fog? If Thornvael burns, every last soul on these flagstones burns together!',
        voiceId: 'vo_act3_korvus_01',
      },
      {
        id: 'm35_k2',
        who: 'Harbor Marshal Veyra',
        portrait: 'portrait_veyra',
        text: 'They are away! May the salt winds carry them past the rim—now, Commander, let us show this butcher how soldiers of Thornvael fight!',
        voiceId: 'vo_act3_veyra_02',
      },
    ],
  },

  // ---------------- ACT IV ----------------
  {
    sceneId: 'm39_malrik_flight',
    missionId: 'm39',
    act: 4,
    trigger: 'boss_intro',
    lines: [
      {
        id: 'm39_l1',
        who: 'Arch-Mage Malrik',
        portrait: 'portrait_malrik',
        text: 'You still cling to dead banners? The Iron Pact offered order while your precious fleet ran like rats from a sinking hull!',
        voiceId: 'vo_act4_malrik_01',
      },
      {
        id: 'm39_l2',
        who: 'Commander',
        portrait: 'portrait_hero',
        text: 'You sold the northern passes to save your own skin, Malrik. You are not reaching that teleportation shrine.',
        voiceId: 'vo_act4_hero_01',
      },
    ],
  },
  {
    sceneId: 'm44_threshold_choice',
    missionId: 'm44',
    act: 4,
    trigger: 'end',
    lines: [
      {
        id: 'm44_l1',
        who: 'Archivist Orla',
        portrait: 'portrait_orla',
        text: 'Steel brought you to the Threshold, Commander, but only will decides what survives. Step West to bind the Caldera in Order, or East to claim the Ember Crown.',
        voiceId: 'vo_act4_orla_01',
      },
      {
        id: 'm44_l2_ring',
        who: 'Archivist Orla',
        portrait: 'portrait_orla',
        text: 'I see Morvessa’s Signet on your hand. She tried to balance the world with coin; now you must balance it with eternity.',
        voiceId: 'vo_act4_orla_ring',
        requiresFlag: 'hasMorvessaRing',
      },
    ],
  },
  {
    sceneId: 'm45_korrath_intro',
    missionId: 'm45',
    act: 4,
    trigger: 'boss_intro',
    lines: [
      {
        id: 'm45_l1',
        who: 'Arch-Warden Korrath',
        portrait: 'portrait_korrath',
        text: 'Three centuries I have stood in granite stillness so chaos would not unmake the realm. You bring mortal weakness into the Crown Vault.',
        voiceId: 'vo_act4_korrath_01',
      },
      {
        id: 'm45_l2',
        who: 'Archivist Orla',
        portrait: 'portrait_orla',
        text: 'Sunder the West and East Resonance Anchors first, Commander! While they hum, his petrified armor cannot be broken!',
        voiceId: 'vo_act4_orla_02',
      },
    ],
  },
  {
    sceneId: 'm45_korrath_death',
    missionId: 'm45',
    act: 4,
    trigger: 'boss_death',
    lines: [
      {
        id: 'm45_d1',
        who: 'Arch-Warden Korrath',
        portrait: 'portrait_korrath',
        text: 'The empire was peace... without immutable law... you are only dust in the wind...',
        voiceId: 'vo_act4_korrath_death',
      },
    ],
  },
  {
    sceneId: 'm46_vorak_intro',
    missionId: 'm46',
    act: 4,
    trigger: 'boss_intro',
    lines: [
      {
        id: 'm46_l1',
        who: 'Ember Overlord Vorak',
        portrait: 'portrait_vorak',
        text: 'Look upon the kiln, mortal! Your cities are slag and your mercy is ash—only what survives the magma deserves to reign!',
        voiceId: 'vo_act4_vorak_01',
      },
      {
        id: 'm46_l2',
        who: 'Marshal Vance',
        portrait: 'portrait_vance',
        text: 'Shatter the twin obsidian conduits, Commander! Cut off his magma flow before he turns this entire chamber into a crematorium!',
        voiceId: 'vo_act4_vance_01',
      },
    ],
  },
  {
    sceneId: 'm46_vorak_death',
    missionId: 'm46',
    act: 4,
    trigger: 'boss_death',
    lines: [
      {
        id: 'm46_d1',
        who: 'Ember Overlord Vorak',
        portrait: 'portrait_vorak',
        text: 'Burn, then... take the Crown... but the fire never forgets who lit it...',
        voiceId: 'vo_act4_vorak_death',
      },
    ],
  },
];

// ============================================================================
// 3. BOSS COMBAT BARKS (4.5s COOLDOWN FLOATING TEXT + AUDIO)
// ============================================================================

export const BOSS_COMBAT_BARKS: Record<string, CombatBark[]> = {
  groktar: [
    { id: 'bark_grok_1', speaker: "Chieftain Grok'tar", trigger: 'aggro', text: 'Your copper buys my axes!', voiceId: 'bark_groktar_01' },
    { id: 'bark_grok_2', speaker: "Chieftain Grok'tar", trigger: 'low_hp', text: 'The Silk Lady promised an easy raid!', voiceId: 'bark_groktar_02' },
  ],
  morvessa: [
    { id: 'bark_morv_1', speaker: 'Morvessa', trigger: 'ability', text: 'Debt comes due!', voiceId: 'bark_morvessa_01' },
    { id: 'bark_morv_2', speaker: 'Morvessa', trigger: 'phase2', text: 'Liquidate the ledger! Swarm them!', voiceId: 'bark_morvessa_02' },
    { id: 'bark_morv_3', speaker: 'Morvessa', trigger: 'low_hp', text: 'You are burning the whole continent to save a village!', voiceId: 'bark_morvessa_03' },
  ],
  velen: [
    { id: 'bark_vel_1', speaker: 'Commander Velen', trigger: 'aggro', text: 'Hold the gate! Break their shields!', voiceId: 'bark_velen_01' },
    { id: 'bark_vel_2', speaker: 'Commander Velen', trigger: 'low_hp', text: 'Tell Vaelen... I never hated the North...', voiceId: 'bark_velen_02' },
  ],
  gorrathul: [
    { id: 'bark_gor_1', speaker: 'Gorrathul', trigger: 'aggro', text: 'Freeze in the lie!', voiceId: 'bark_gorrathul_01' },
    { id: 'bark_gor_2', speaker: 'Gorrathul', trigger: 'phase2', text: 'Open the valves! Boil their bones!', voiceId: 'bark_gorrathul_02' },
    { id: 'bark_gor_3', speaker: 'Gorrathul', trigger: 'ability', text: 'The mountain gives nothing!', voiceId: 'bark_gorrathul_03' },
  ],
  korvus: [
    { id: 'bark_korv_1', speaker: 'Lord-Captain Korvus', trigger: 'aggro', text: 'Drag them under the keel!', voiceId: 'bark_korvus_01' },
    { id: 'bark_korv_2', speaker: 'Lord-Captain Korvus', trigger: 'phase2', text: 'Torch the gangplanks! None leave alive!', voiceId: 'bark_korvus_02' },
  ],
  korrath: [
    { id: 'bark_korr_1', speaker: 'Arch-Warden Korrath', trigger: 'ability', text: 'Be still. Be stone.', voiceId: 'bark_korrath_01' },
    { id: 'bark_korr_2', speaker: 'Arch-Warden Korrath', trigger: 'phase2', text: 'The anchors fall—yet Law endures!', voiceId: 'bark_korrath_02' },
  ],
  vorak: [
    { id: 'bark_vor_1', speaker: 'Ember Overlord Vorak', trigger: 'ability', text: 'Melt into truth!', voiceId: 'bark_vorak_01' },
    { id: 'bark_vor_2', speaker: 'Ember Overlord Vorak', trigger: 'phase2', text: 'Let the Caldera swallow you whole!', voiceId: 'bark_vorak_02' },
  ],
};

// ============================================================================
// 4. LIVING HUB EVOLUTION (FOR src/townui.ts)
// ============================================================================

export const HUB_EVOLUTION: HubEvolutionStage[] = [
  // Act I — Thornwick Market
  {
    act: 1,
    hubId: 'thornwick',
    hubName: 'Thornwick Market',
    afterMission: 'START',
    visualFilter: 'saturate(0.85) brightness(0.92)',
    particles: 'rain',
    townDescription: 'Cold drizzle slicks the palisade logs. Reeve Marlow counts empty grain sacks while Master Kaelen hammers iron in the mud.',
    ambientNote: 'Steady rain, distant river rush, muted forge hammer.',
  },
  {
    act: 1,
    hubId: 'thornwick',
    hubName: 'Thornwick Market',
    afterMission: 'MQ1-02',
    visualFilter: 'saturate(0.75) brightness(0.88)',
    particles: 'rain',
    townDescription: 'Mud-soaked refugees from the fen huddle under the eaves. Dozens of wax candles flicker before Father Cael’s shrine.',
    ambientNote: 'Quiet weeping, crackling vigil candles, heavy rain.',
    unlockedMercenary: 'Defrocked Lantern-Scribe',
  },
  {
    act: 1,
    hubId: 'thornwick',
    hubName: 'Thornwick Market',
    afterMission: 'MQ1-04',
    visualFilter: 'saturate(0.65) sepia(0.12)',
    particles: 'ash_light',
    townDescription: 'Morvessa is dead, yet no one celebrates. For the first time, pale gray ash drifts down from the southern wind onto Thornwick’s roofs.',
    ambientNote: 'Eerie stillness, dry southern gusts, distant church bell.',
  },

  // Act II — Redmarsh Outpost
  {
    act: 2,
    hubId: 'redmarsh',
    hubName: 'Redmarsh Outpost',
    afterMission: 'START',
    visualFilter: 'sepia(0.28) contrast(1.08)',
    particles: 'alkali_storm',
    townDescription: 'Blinding alkali dust whips across the limestone stilts. A single tin dipper of boiled brine costs a silver piece at Jassim’s counter.',
    ambientNote: 'Howling sandstorm, creaking rope bridges.',
  },
  {
    act: 2,
    hubId: 'redmarsh',
    hubName: 'Redmarsh Outpost',
    afterMission: 'MQ2-03',
    visualFilter: 'saturate(1.05) contrast(1.05)',
    particles: 'clear_heat',
    townDescription: 'With the Quartz Wardstones cleansed, the toxic storm vanishes. A raw copper-blue sky reveals the black peak of Ironheart in the south.',
    ambientNote: 'Crisp desert wind, Forgemaster Vok’s rhythmic anvil.',
    unlockedMercenary: 'Third-Dynasty Tomb Notary',
  },
  {
    act: 2,
    hubId: 'redmarsh',
    hubName: 'Redmarsh Outpost',
    afterMission: 'MQ2-04',
    visualFilter: 'saturate(1.0) contrast(1.05)',
    particles: 'clear_heat',
    townDescription: 'Freed quarry miners with snapped iron collars crowd the lower stilts, sharpening stolen black-ironstone picks.',
    ambientNote: 'Grinding whetstones, defiant low voices.',
    unlockedMercenary: 'Deep Quarry Sapper',
  },

  // Act III — Oakhaven & Harborwatch
  {
    act: 3,
    hubId: 'oakhaven',
    hubName: 'Oakhaven Frontier',
    afterMission: 'START',
    visualFilter: 'saturate(0.9) hue-rotate(-5deg)',
    particles: 'sea_spray',
    townDescription: 'Ironwood axes ring along the cliffs as Bailiff Aldric tallies incoming refugees against shrinking bread stores.',
    ambientNote: 'Crashing surf, timber saws, gulls in the gale.',
  },
  {
    act: 3,
    hubId: 'harborwatch',
    hubName: 'Harborwatch War-Docks',
    afterMission: 'm30',
    visualFilter: 'contrast(1.1) sepia(0.15)',
    particles: 'embers',
    townDescription: 'Granite seawalls groan under the Western Sea. Master Kors’s iron cranes swing day and night to load the Great Evacuation caravels.',
    ambientNote: 'Clanging alarm bells, creaking cranes, shouting marines.',
    unlockedMercenary: 'Oakhaven Boarding Marine',
  },

  // Act IV — Highcrest Citadel
  {
    act: 4,
    hubId: 'highcrest',
    hubName: 'Highcrest Citadel',
    afterMission: 'START',
    visualFilter: 'contrast(1.15) saturate(0.85)',
    particles: 'cinder_snow',
    townDescription: 'Gray cinder-snow drifts across the granite spires. Marshal Vance and Harbor Marshal Veyra stand over the caldera maps in grim silence.',
    ambientNote: 'Freezing alpine wind, distant tectonic rumble.',
    unlockedMercenary: 'Ironcamp Halberdier',
  },
  {
    act: 4,
    hubId: 'highcrest',
    hubName: 'Highcrest Citadel',
    afterMission: 'm42',
    visualFilter: 'contrast(1.2) sepia(0.2)',
    particles: 'embers',
    townDescription: 'The Outer Rampart is breached. The eastern horizon glows incandescent violet as the rearguard sharpens meteoric steel for the Threshold.',
    ambientNote: 'Low volcanic thunder, humming wardstones.',
    unlockedMercenary: 'Caldera Siege-Engineer',
  },
];

// ============================================================================
// 5. ENGINE HELPER FUNCTIONS (CAMPAIGN & UI INTEGRATION)
// ============================================================================

/**
 * Returns only the dialogue lines valid for the player's current StoryFlags.
 */
export function getActiveDialogueLines(
  sceneId: string,
  flags: StoryFlags
): DialogueLine[] {
  const scene = MISSION_DIALOGUES.find((s) => s.sceneId === sceneId);
  if (!scene) return [];

  return scene.lines.filter((line) => {
    if (line.requiresFlag && !flags[line.requiresFlag]) return false;
    if (line.forbidsFlag && flags[line.forbidsFlag]) return false;
    return true;
  });
}

/**
 * Resolves the latest HubEvolutionStage for the given Act based on completed mission IDs.
 */
export function getCurrentHubStage(
  act: ActId,
  completedMissions: string[]
): HubEvolutionStage | undefined {
  const actStages = HUB_EVOLUTION.filter((s) => s.act === act);
  let active = actStages[0];

  for (const stage of actStages) {
    if (stage.afterMission === 'START' || completedMissions.includes(stage.afterMission)) {
      active = stage;
    }
  }
  return active;
}

/**
 * Maps m44 Threshold Choice branch to the canonical final mission node ID
 * used by completeNode(c, p, id, branch) in src/campaign.ts.
 */
export function resolveThresholdBranch(branch: EndingBranch): {
  nextMissionId: string;
  endingSlideId: string;
} {
  if (branch === 'order') {
    return {
      nextMissionId: 'm45-crown-of-order',
      endingSlideId: 'ending_order',
    };
  }
  return {
    nextMissionId: 'm46-ember-reckoning',
    endingSlideId: 'ending_ember',
  };
}
