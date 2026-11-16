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
    title: 'Act I — Граничните бродове (The Border Fords)',
    subtitle: 'Началото на похода през Торнваел',
    triggerNode: 'm01-blood-at-the-ford',
    slides: [
      {
        id: 'a1-1',
        heading: 'Пепел по крайграничния път',
        caption: 'Дим се издига над граничните реки. Войските на границата отстъпват, оставяйки само неколцина смелчаци да бранят последните дървени мостове.',
        backdrop: '#2c3d29',
        cue: 'calm',
      },
      {
        id: 'a1-2',
        heading: 'Сборът в Торнуик',
        caption: 'Наемници, ветерани и самотни магове се събират в пазарния площад на Торнуик, обединени от една обща цел преди настъплението към пустошта.',
        backdrop: '#384b32',
        cue: 'march',
      },
    ],
  },
  {
    id: 'act-2',
    act: 2,
    kind: 'intro',
    title: 'Act II — Пътят през пресъхващите блата към пустинята',
    subtitle: 'Преход от блатата към пясъчната пустош',
    triggerNode: 'm12-redmarsh-border',
    completedNodeTrigger: 'm11-ashbrook-retreat',
    slides: [
      {
        id: 'a2-1',
        heading: 'Пресъхващите блата на Червено блато',
        caption: 'Водите бавно се оттеглят, оставяйки напукана тиня и оголени древни мегалити. Пътят през пресъхващите блата към пустинята се разкрива под жаркото слънце.',
        backdrop: '#453528',
        cue: 'march',
      },
      {
        id: 'a2-2',
        heading: 'Входът към пясъчната пустош',
        caption: 'Вятърът носи сипкав прах и мирис на сяра. Наблюдателните кули са изоставени, а пред отряда лежат два опасни прохода през безпощадната пустиня.',
        backdrop: '#553f2f',
        cue: 'battle',
      },
    ],
  },
  {
    id: 'act-3',
    act: 3,
    kind: 'intro',
    title: 'Act III — Слизане в безслънчевите пещери и подземия',
    subtitle: 'Преход към мрачните бездни под Железния бряг',
    triggerNode: 'm24-pledge-at-oakhaven',
    completedNodeTrigger: 'm23-fork-of-spears',
    slides: [
      {
        id: 'a3-1',
        heading: 'Разломите на Железния бряг',
        caption: 'Крепостите по брега са обградени от магически огньове. Единственият път напред е слизане в безслънчевите пещери и подземия дълбоко под скалния масив.',
        backdrop: '#243545',
        cue: 'march',
      },
      {
        id: 'a3-2',
        heading: 'Безслънчевите катакомби',
        caption: 'Дневната светлина изчезва. Влажните подземни коридори ехтят от древни рунни окови и стъпки на създания, невиждали слънцето от столетия.',
        backdrop: '#2d4154',
        cue: 'battle',
      },
    ],
  },
  {
    id: 'act-4',
    act: 4,
    kind: 'intro',
    title: 'Act IV — Портите на Инферналното светилище',
    subtitle: 'Последната битка за съдбата на Торнваел',
    triggerNode: 'm36-heartland-march',
    completedNodeTrigger: 'm35-burning-harbor',
    slides: [
      {
        id: 'a4-1',
        heading: 'Пепелният поход към Сърцевината',
        caption: 'Земята около цитаделата се тресе, а небето гори в цвят на разтопено желязо. Пътят води право към портите на Инферналното светилище.',
        backdrop: '#3c2529',
        cue: 'battle',
      },
      {
        id: 'a4-2',
        heading: 'Прагът на Светилището',
        caption: 'Масивните обсидианови порти стоят открехнати, излъчвайки древна първична мощ. Всеки удар на сърцето ви приближава до неизбежния финален избор.',
        backdrop: '#4a2b31',
        cue: 'battle',
      },
    ],
  },
  {
    id: 'ending-a',
    act: 4,
    kind: 'ending',
    title: 'Победа — Пречистването на Торнваел',
    subtitle: 'Светлината възтържествува над мрака',
    triggerNode: 'm45-crown-of-order',
    slides: [
      {
        id: 'ea-1',
        heading: 'Падането на Инферналния ковен',
        caption: 'След съкрушаването на архи-пазителя, тежките железни печати се затварят завинаги. Пречистването на Торнваел започва с пречупването на тъмните руни.',
        backdrop: '#2e4152',
        cue: 'triumph',
      },
      {
        id: 'ea-2',
        heading: 'Мир над възродените земи',
        caption: 'Слънцето отново озарява зелените долини и спокойните реки. Воините закачат щитовете си по стените, а Торнваел започва своето ново възраждане.',
        backdrop: '#384b36',
        cue: 'calm',
      },
    ],
  },
  {
    id: 'ending-b',
    act: 4,
    kind: 'ending',
    title: 'Алтернативен край — Възкачването на Тъмния Владетел',
    subtitle: 'Новият ред на огъня и сенките',
    triggerNode: 'm46-ember-reckoning',
    slides: [
      {
        id: 'eb-1',
        heading: 'Счупените вериги на Ембера',
        caption: 'Древният олтар е разчупен на парчета. Първичната огнена магия не е запечатана, а подчинена на вашата непреклонна воля.',
        backdrop: '#522c24',
        cue: 'triumph',
      },
      {
        id: 'eb-2',
        heading: 'Възкачването на Тъмния Владетел',
        caption: 'Вие се възкачвате на обсидиановия трон. Знамената на пепелта се развяват над цял Торнваел, а победените врагове скланят глави пред новия господар.',
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
