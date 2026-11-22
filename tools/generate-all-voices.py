#!/usr/bin/env python3
"""
Generate natural neural human speech lines (edge-tts -> mono 24kHz AAC-LC .m4a)
for ALL campaign mission dialogues, cutscenes, town lore/NPCs, and barks in Thornvael.

Outputs:
  - public/audio/voices/<clipId>.m4a
  - src/voice-clips.ts (typed indexes for automatic runtime resolution)
  - assets.json (provenance entries for all generated voice files)
"""
from __future__ import annotations

import argparse
import asyncio
import glob
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICES_DIR = os.path.join(ROOT_DIR, 'public', 'audio', 'voices')
SRC_MISSIONS = os.path.join(ROOT_DIR, 'src', 'missions')
BARKS_PATH = os.path.join(ROOT_DIR, 'src', 'data', 'text', 'barks.json')
CONTENT_DIR = os.path.join(ROOT_DIR, 'public', 'data', 'content')
ASSETS_JSON = os.path.join(ROOT_DIR, 'assets.json')
VOICE_CLIPS_TS = os.path.join(ROOT_DIR, 'src', 'voice-clips.ts')


@dataclass
class VoiceProfile:
    voice: str
    pitch: str
    rate: str


PROFILES: dict[str, VoiceProfile] = {
    'narrator': VoiceProfile('en-GB-RyanNeural', '+0Hz', '-3%'),
    'hale': VoiceProfile('en-GB-RyanNeural', '-6Hz', '-4%'),
    'garrick': VoiceProfile('en-GB-ThomasNeural', '-4Hz', '-3%'),
    'reeve_marlow': VoiceProfile('en-US-RogerNeural', '-3Hz', '-3%'),
    'reeve_alda': VoiceProfile('en-GB-SoniaNeural', '-2Hz', '-2%'),
    'kaelen': VoiceProfile('en-US-ChristopherNeural', '-4Hz', '-2%'),
    'morvessa': VoiceProfile('en-GB-SoniaNeural', '-6Hz', '-5%'),
    'marta': VoiceProfile('en-US-AriaNeural', '-2Hz', '-2%'),
    'female_warrior': VoiceProfile('en-IE-EmilyNeural', '-2Hz', '+0%'),
    'female_scholar': VoiceProfile('en-GB-LibbyNeural', '+0Hz', '+0%'),
    'smith': VoiceProfile('en-US-AndrewNeural', '-4Hz', '-4%'),
    'merrick': VoiceProfile('en-AU-WilliamMultilingualNeural', '-6Hz', '-2%'),
    'bram': VoiceProfile('en-IE-ConnorNeural', '-4Hz', '-2%'),
    'barkeep': VoiceProfile('en-US-GuyNeural', '-3Hz', '+0%'),
    'scholar': VoiceProfile('en-GB-ThomasNeural', '+2Hz', '-3%'),
    'scout': VoiceProfile('en-US-EricNeural', '+0Hz', '+2%'),
    'sailor': VoiceProfile('en-AU-WilliamMultilingualNeural', '-2Hz', '+0%'),
    'youth': VoiceProfile('en-GB-MaisieNeural', '+2Hz', '+3%'),
    'boss': VoiceProfile('en-US-SteffanNeural', '-12Hz', '-6%'),
    'vesperion': VoiceProfile('en-GB-RyanNeural', '-10Hz', '-5%'),
    'hero': VoiceProfile('en-US-BrianNeural', '-2Hz', '+0%'),
}


def pick_profile(speaker: str, context_hint: str = '') -> VoiceProfile:
    s = f'{speaker} {context_hint}'.lower()
    if any(w in s for w in ('morvessa', 'morwyn')):
        return PROFILES['morvessa']
    if any(w in s for w in ('grok', 'gorrathul', 'ashkarath', 'vorak', 'korvus', 'iron anchor', 'juggernaut', 'colossus', 'warlord')):
        return PROFILES['boss']
    if any(w in s for w in ('vesperion', 'korrath', 'arch-warden', 'malrik')):
        return PROFILES['vesperion']
    if any(w in s for w in ('hale', 'warden hale')):
        return PROFILES['hale']
    if 'garrick' in s or 'garrik' in s:
        return PROFILES['garrick']
    if any(w in s for w in ('marlow', 'bailiff', 'aldric')):
        return PROFILES['reeve_marlow']
    if 'alda' in s:
        return PROFILES['reeve_alda']
    if any(w in s for w in ('kaelen', 'vance', 'rowan')):
        return PROFILES['kaelen']
    if any(w in s for w in ('marta', 'alchemist', 'sorceress')):
        return PROFILES['marta']
    if any(w in s for w in ('lyra', 'isolde', 'veyra', 'linna', 'tessa')):
        return PROFILES['female_warrior']
    if any(w in s for w in ('sera', 'orla', 'elowen', 'zahra', 'wren', 'archivist', 'acolyte', 'novice')):
        return PROFILES['female_scholar']
    if any(w in s for w in ('hobb', 'smith', 'vok', 'elda', 'gorin', 'dunstan', 'sapper')):
        return PROFILES['smith']
    if any(w in s for w in ('merrick', 'draven', 'toren', 'halberdier')):
        return PROFILES['merrick']
    if any(w in s for w in ('bram', 'orson', 'hal', 'levyman', 'marine')):
        return PROFILES['bram']
    if any(w in s for w in ('barkeep', 'corin', 'innkeeper')):
        return PROFILES['barkeep']
    if any(w in s for w in ('quillon', 'vaelen', 'vane', 'aldren', 'elias', 'orlen', 'seti', 'cael', 'notary', 'battlemage', 'channeler')):
        return PROFILES['scholar']
    if any(w in s for w in ('bren', 'kael', 'sabik', 'poacher', 'arbalest', 'scout', 'outrider', 'ranger')):
        return PROFILES['scout']
    if any(w in s for w in ('fenwick', 'kors', 'tavin', 'veren', 'ferryman', 'shipwright', 'harbor')):
        return PROFILES['sailor']
    if 'pip' in s or 'mudlark' in s:
        return PROFILES['youth']
    if 'hero' in s or 'commander' in s:
        return PROFILES['hero']
    return PROFILES['narrator']


def slugify(s: str) -> str:
    return re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')


def strip_disco_tags(text: str) -> str:
    speech = re.sub(r'^\[([A-Z\s/-]+(?::\s*[A-Za-z]+)?)\]\s*', '', text.strip())
    speech = re.sub(r'^\*\((.*?)\)\*\s*', '', speech, flags=re.DOTALL)
    speech = speech.strip()
    return speech if speech else text.strip()


def normalize_voice_hash_key(text: str) -> str:
    speech = strip_disco_tags(text)
    clean = re.sub(r'[^a-z0-9]+', '', speech.lower())
    h1 = 0x811C9DC5
    h2 = 0x811C9DC5
    for idx, ch in enumerate(clean):
        c = ord(ch)
        h1 ^= c
        h1 = (h1 * 0x01000193) & 0xFFFFFFFF
        h2 ^= c ^ (idx & 0xFF)
        h2 = (h2 * 0x01000193) & 0xFFFFFFFF
    return f'{h1:08x}{h2:08x}'


@dataclass
class ClipSpec:
    clip_id: str
    spoken_text: str
    raw_text: str
    speaker: str
    note: str
    profile: VoiceProfile


# Hardcoded Town Lore lines from src/townui.ts openLoreDialogue()
TOWN_LORE_LINES: list[tuple[str, str, str]] = [
    (
        'lore__warden_hale_1',
        'Warden Hale',
        "The river runs black with soot, Commander. Grok'tar's highland gnolls didn't merely stumble down into the shallows—they were driven south by horrors stirring in the high crags. The High Council sits warm behind their granite walls in the capital, writing decrees in red wax while we drown in mud for a handful of copper. If the fords break, there is no second line of defense. Thornwick starves before the first frost.",
    ),
    (
        'lore__warden_hale_2',
        'Warden Hale',
        "Captain Merrick holds the high stone bastions with sixty men, but their supply wagons were plundered at the crossroads. Sixty men against two thousand howling spears. War out here isn't won by songs; it's won by salt pork, dry bowstrings, and boots that don't rot in the silt. Every casualty is an irreplaceable blade.",
    ),
    (
        'lore__warden_hale_3',
        'Warden Hale',
        "Three centuries ago, the First Wardens swore an oath upon celestial gold. When the continental bedrock buckled, their flesh rotted away, but the words stayed chained to their marrow. They march beneath the earth in unbroken ranks—Hollow Knights who know neither fear nor fatigue. Pray you never hear their iron tread in the dark.",
    ),
    (
        'lore__ford_scout_bren_1',
        'Ford-Scout Bren',
        "I crept through the willow reeds at twilight, bellied down in the cold mire. Grok'tar's barbed bowmen don't fire from the open; they notch their horns behind the sunken silt bars and wait for the vanguard to flounder. If you march straight down the river center, their shafts will pin your halberdiers like beetles to a board. Flank along the high gravel spits—gravel holds your footing.",
    ),
    (
        'lore__ford_scout_bren_2',
        'Ford-Scout Bren',
        "Smell that? Bitter almond and marsh viper gall. They dip their barbs in rancid bile. A surface scratch inflames the veins within thirty heartbeats; by sunset, your blood turns to black water. Keep your visors locked and your shields overlapping until you close distance.",
    ),
    (
        'lore__ford_scout_bren_3',
        'Ford-Scout Bren',
        "Beneath the gravel shallows lie granite tombs older than the kingdom. The river gnolls have been prying at the runic seals with crude iron picks, seeking star-silver amulets. When they strike those wardstones, the water turns freezing cold and dead fish float belly-up to the surface. Sunder their cabal before they wake what sleeps beneath the silt.",
    ),
    (
        'lore__master_corin_1',
        'Master Corin',
        "Flour is up forty percent since the border mill went up in flames, Commander. Salt is scarcer than imperial mercy, and the beer is half marsh-water. But gold? Gold still talks. Every deserter, merchant, and cutpurse passes through this taproom. If you need blades that won't ask questions about who gave the order, look around the hearth. Just don't lend them money.",
    ),
    (
        'lore__master_corin_2',
        'Master Corin',
        "Old miners say that beneath the Redmarsh lies an ancient subterranean highway paved before the First Age. The vaults down there were never ransacked—only sealed when the sky rained molten iron. If you venture down into the dark, Commander, carry twice as many torches as you think you need, and don't drink the water. Even the rats down there have two heads.",
    ),
    (
        'lore__master_corin_3',
        'Master Corin',
        "Notice the edge? Shaved down by coin-clippers in the garrison quartermaster's office. The empire pays its mercenaries with debased silver, then wonders why cohorts desert at the first sign of a gnoll war-horn. If you want loyalty on this border, you pay in steel and bread, not empty oaths.",
    ),
    (
        'lore__high_arcanist_vaelen_1',
        'High Arcanist Vaelen',
        "The fools in the council believe magic is a gentle celestial gift. It is not. The Astral Veil is a bleeding, scarred membrane keeping primeval cosmic hungers from swallowing our world whole. Every time an apostate or blood-shaman cracks a wardstone, that membrane stretches and thins. The cold you feel in your teeth before a lightning strike? That is the universe groaning under mortal arrogance.",
    ),
    (
        'lore__high_arcanist_vaelen_2',
        'High Arcanist Vaelen',
        "Necromancy was not invented by monsters; it was commissioned by desperate imperial generals whose legions had frozen in the northern passes. When you bind an astral runic chain to cold bone, you are not resurrecting life—you are creating a mechanical puppet powered by spiritual agony. It is efficient, yes. But the debt must always be settled in blood.",
    ),
    (
        'lore__high_arcanist_vaelen_3',
        'High Arcanist Vaelen',
        "At the heart of the Obsidian Caldera, the bedrock breathes. Ember Overlord Vorak does not hate humanity; he simply views us as a moldering parasitic rot upon the earth's crust. To him, incandescent magma is the only true antiseptic. If you face him without mastering the elemental counter-spheres—stone to absorb, frost to quench—your vanguard will be reduced to ash before they can draw steel.",
    ),
    (
        'lore__captain_merrick_1',
        'Captain Merrick',
        "New recruits think three millimeters of tempered steel makes them immortal. It does not. A gnoll war-pick or a basalt club doesn't need to pierce the cuirass—the kinetic shockwave travels straight through the metal into the ribcage, rupturing the spleen and collapsing the lungs. Mind your skull padding and check your arming doublet after every foray. Dead men don't get paid.",
    ),
    (
        'lore__captain_merrick_2',
        'Captain Merrick',
        "If you discover matching pieces of an antique battlegear set, never sell them for quick coin. The First Wardens forged them with harmonized astral runes. Worn together, the pieces resonate like tuned church bells, generating protective kinetic fields no single smith could ever hammer into iron.",
    ),
    (
        'lore__captain_merrick_3',
        'Captain Merrick',
        "The smuggler caskets dragged out of the fens are a desperate gambler's game. Most hold rusted chain links and tarnished pewter rings from dead soldiers. But every hundredth box? Pried open beneath the blood-grease is a pristine ancestral blade from the old kingdom. If you have gold to burn, roll the dice. Just don't wager your last coin.",
    ),
    (
        'town__barkeep_greet_1',
        'Master Corin',
        "Pull up a stool by the hearth, Commander. The ale's watered, the stew's thin, but every sell-sword worth his salt is waiting by the fire.",
    ),
    (
        'town__barkeep_greet_2',
        'Master Corin',
        "Keep your steel dry and your coin-purse belted tight. Half the border wants work and the other half wants gossip.",
    ),
]


def collect_clips() -> tuple[
    dict[str, ClipSpec],
    dict[str, str],
    dict[str, str],
    dict[str, str],
]:
    clips: dict[str, ClipSpec] = {}
    map_index: dict[str, str] = {}
    bark_index: dict[str, str] = {}
    text_index: dict[str, str] = {}

    def add_clip(
        clip_id: str,
        raw_text: str,
        speaker: str,
        note: str,
        context_hint: str = '',
        index_hash: bool = True,
    ) -> str:
        spoken = strip_disco_tags(raw_text)
        if clip_id not in clips:
            clips[clip_id] = ClipSpec(
                clip_id=clip_id,
                spoken_text=spoken,
                raw_text=raw_text,
                speaker=speaker,
                note=note,
                profile=pick_profile(speaker, context_hint),
            )
        if index_hash and spoken:
            h = normalize_voice_hash_key(raw_text)
            if h not in text_index:
                text_index[h] = clip_id
        return clip_id

    # 1. Preserve the 4 existing Mission 1 / Act 1 clips verbatim
    add_clip(
        'm01_briefing_hale',
        'Blood at the Ford. Hostile warbands have breached the frontier riverbanks and fired the watch outposts. Rally your vanguard, advance across the shallows under covering fire, and strike down their warlord before our lines are encircled.',
        'Warden Hale',
        'Neural human speech dialogue line for Warden Hale mission 1 briefing',
        index_hash=False,
    )
    add_clip(
        'cs_act1_start_01_narrator',
        "Cold drizzle turns Thornwick's market square into churned ochre paste as watch-bells clang from the river gate.",
        'Narrator',
        'Neural human speech dialogue line for Act 1 opening (Narrator)',
    )
    add_clip(
        'cs_act1_start_02_garrick',
        'Three patrols overdue from Sunken Ford, and now smoke is rising off the tollhouse roof.',
        'Garrick Captain',
        'Neural human speech dialogue line for Garrick Captain',
    )
    add_clip(
        'cs_act1_start_03_garrick',
        'You heard the commander. Check your cinch-straps—nobody gets buried on company time.',
        'Garrick Captain',
        'Neural human speech dialogue line for Garrick Captain',
    )

    # 2. All 79 campaign/skirmish map files (body, msg.*, npc.*)
    for path in sorted(glob.glob(os.path.join(SRC_MISSIONS, '*.map.json'))):
        with open(path, encoding='utf-8') as f:
            doc = json.load(f)
        doc_name = str(doc.get('name') or os.path.basename(path).replace('.map.json', ''))
        doc_slug = slugify(doc_name)
        txt: dict[str, str] = doc.get('text', {}) or {}

        body = str(txt.get('body', '')).strip()
        if body:
            cid = f'map__{doc_slug}__body'
            add_clip(cid, body, 'Warden Hale', f'Mission briefing voice line for {doc_name}')
            map_index[f'{doc_slug}::body'] = cid

        for key in sorted(txt.keys()):
            val = str(txt.get(key, '')).strip()
            if not val:
                continue
            if re.match(r'^msg\.\d+$', key):
                n = key.split('.')[1]
                who = str(txt.get(f'{key}.who', 'Warden Hale')).strip() or 'Warden Hale'
                cid = f'map__{doc_slug}__msg_{n}'
                add_clip(cid, val, who, f'Mission dialogue {key} for {doc_name} ({who})')
                map_index[f'{doc_slug}::{key}'] = cid
            elif key.startswith('npc.'):
                npc_slug = slugify(key[4:])
                cid = f'map__{doc_slug}__npc_{npc_slug}'
                add_clip(cid, val, npc_slug, f'Map NPC dialogue {key} for {doc_name}', context_hint=key)
                map_index[f'{doc_slug}::{key}'] = cid

    # 3. All 264 barks in src/data/text/barks.json
    with open(BARKS_PATH, encoding='utf-8') as f:
        barks: dict[str, str] = json.load(f)
    for bkey, bval in sorted(barks.items()):
        val = str(bval).strip()
        if not val:
            continue
        cid = f'bark__{slugify(bkey)}'
        speaker_hint = bkey.split('.')[1] if '.' in bkey else bkey
        add_clip(cid, val, speaker_hint, f'Unit/NPC bark line for {bkey}', context_hint=bkey)
        bark_index[bkey] = cid

    # 4. Content cutscenes, mission-texts briefings, missions intro_scene, bosses pre_fight & boss-dialogue
    cs_path = os.path.join(CONTENT_DIR, 'cutscenes.json')
    if os.path.exists(cs_path):
        for cs in json.load(open(cs_path, encoding='utf-8')):
            act = cs.get('act', 1)
            timing = cs.get('timing', 'start')
            for idx, line_obj in enumerate(cs.get('lines', []), start=1):
                sp = str(line_obj.get('speaker', 'narrator'))
                ln = str(line_obj.get('line', '')).strip()
                if not ln:
                    continue
                if act == 1 and timing == 'start' and idx == 1:
                    continue
                if act == 1 and timing == 'start' and idx == 2:
                    continue
                if act == 1 and timing == 'start' and idx == 3:
                    continue
                cid = f'cs_act{act}_{timing}_{idx:02d}_{slugify(sp)}'
                add_clip(cid, ln, sp, f'Act {act} {timing} cutscene line {idx} ({sp})')

    mt_path = os.path.join(CONTENT_DIR, 'mission-texts.json')
    if os.path.exists(mt_path):
        for mt in json.load(open(mt_path, encoding='utf-8')):
            mid = slugify(str(mt.get('mission_id', 'mission')))
            briefing = str(mt.get('briefing', '')).strip()
            if briefing:
                cid = f'mt_{mid}_briefing'
                add_clip(cid, briefing, 'Narrator', f'Campaign chronicle briefing for {mid}')

    missions_path = os.path.join(CONTENT_DIR, 'missions.json')
    if os.path.exists(missions_path):
        missions_data = json.load(open(missions_path, encoding='utf-8'))
        for mkey, mval in sorted(missions_data.items()):
            mslug = slugify(mkey)
            for idx, sc in enumerate(mval.get('intro_scene', []), start=1):
                sp = str(sc.get('speaker', 'narrator'))
                ln = str(sc.get('line', '')).strip()
                if not ln:
                    continue
                cid = f'mc_{mslug}_intro_{idx:02d}_{slugify(sp)}'
                add_clip(cid, ln, sp, f'Campaign intro dialogue for {mkey} line {idx} ({sp})')

    bosses_path = os.path.join(CONTENT_DIR, 'bosses.json')
    if os.path.exists(bosses_path):
        bosses_data = json.load(open(bosses_path, encoding='utf-8'))
        for bkey, bval in sorted(bosses_data.items()):
            bslug = slugify(bkey)
            for idx, sc in enumerate(bval.get('pre_fight', []), start=1):
                sp = str(sc.get('speaker', bkey))
                ln = str(sc.get('line', '')).strip()
                if not ln:
                    continue
                cid = f'boss_{bslug}_pre_{idx:02d}_{slugify(sp)}'
                add_clip(cid, ln, sp, f'Boss pre-fight line for {bkey} ({sp})')

    bd_path = os.path.join(CONTENT_DIR, 'boss-dialogue.json')
    if os.path.exists(bd_path):
        for bobj in json.load(open(bd_path, encoding='utf-8')):
            bkey = str(bobj.get('boss', 'boss'))
            intro = str(bobj.get('intro', '')).strip()
            if intro:
                cid = f'bd_{slugify(bkey)}_intro'
                add_clip(cid, intro, bkey, f'Boss intro line for {bkey}')

    # 5. Town Lore dialogues & Barkeep greetings
    for cid, sp, line in TOWN_LORE_LINES:
        add_clip(cid, line, sp, f'Thornwick town dialogue line ({sp})')

    # 6. Story slideshow sequences (src/story.ts)
    story_ts = os.path.join(ROOT_DIR, 'src', 'story.ts')
    if os.path.exists(story_ts):
        story_url = 'file:///' + story_ts.replace('\\', '/')
        res = subprocess.run(
            [
                'node',
                '-e',
                f"import('{story_url}').then(m => console.log(JSON.stringify(m.STORY_SEQUENCES)))",
            ],
            capture_output=True,
            text=True,
            encoding='utf-8',
            check=True,
        )
        for seq in json.loads(res.stdout):
            seq_id = str(seq.get('id', 'story'))
            for slide in seq.get('slides', []):
                slide_id = str(slide.get('id', 'slide'))
                heading = str(slide.get('heading', '')).strip()
                caption = str(slide.get('caption', '')).strip()
                reflection = str(slide.get('reflection', '') or '').strip()
                speech = f'{heading}. {caption}' + (f' {reflection}' if reflection else '')
                cid = f'story__{slugify(seq_id)}__{slugify(slide_id)}'
                add_clip(cid, speech, 'Narrator', f'Story slideshow narration for {seq_id} ({slide_id})')

    return clips, map_index, bark_index, text_index


async def generate_audio(clips: dict[str, ClipSpec], force: bool, concurrency: int) -> None:
    os.makedirs(VOICES_DIR, exist_ok=True)
    todo: list[ClipSpec] = []
    for spec in clips.values():
        m4a = os.path.join(VOICES_DIR, f'{spec.clip_id}.m4a')
        if force or not os.path.exists(m4a) or os.path.getsize(m4a) < 512:
            todo.append(spec)

    print(f'Total clips registered: {len(clips)} | To synthesize: {len(todo)}')
    if not todo:
        return

    sem = asyncio.Semaphore(concurrency)
    done_count = 0
    failed: list[tuple[str, str]] = []

    async def synth_one(spec: ClipSpec) -> None:
        nonlocal done_count
        mp3 = os.path.join(VOICES_DIR, f'{spec.clip_id}.mp3')
        m4a = os.path.join(VOICES_DIR, f'{spec.clip_id}.m4a')
        async with sem:
            last_err = ''
            for attempt in range(3):
                try:
                    comm = edge_tts.Communicate(
                        spec.spoken_text,
                        spec.profile.voice,
                        pitch=spec.profile.pitch,
                        rate=spec.profile.rate,
                    )
                    await comm.save(mp3)
                    subprocess.run(
                        [
                            'ffmpeg',
                            '-y',
                            '-i',
                            mp3,
                            '-c:a',
                            'aac',
                            '-b:a',
                            '48k',
                            '-ac',
                            '1',
                            '-ar',
                            '24000',
                            m4a,
                        ],
                        capture_output=True,
                        check=True,
                    )
                    if os.path.exists(mp3):
                        try:
                            os.remove(mp3)
                        except Exception:
                            pass
                    done_count += 1
                    if done_count % 50 == 0 or done_count == len(todo):
                        print(f'  Synthesized {done_count}/{len(todo)} clips...', flush=True)
                    return
                except Exception as exc:
                    last_err = str(exc)
                    if os.path.exists(mp3):
                        try:
                            os.remove(mp3)
                        except Exception:
                            pass
                    await asyncio.sleep(1.0 * (attempt + 1))
            failed.append((spec.clip_id, last_err))

    await asyncio.gather(*(synth_one(spec) for spec in todo))
    if failed:
        for cid, err in failed[:10]:
            print(f'ERROR generating {cid}: {err}', file=sys.stderr)
        raise RuntimeError(f'{len(failed)} clip(s) failed to synthesize')


def write_voice_clips_ts(
    clips: dict[str, ClipSpec],
    map_index: dict[str, str],
    bark_index: dict[str, str],
    text_index: dict[str, str],
) -> None:
    lines: list[str] = [
        '// Auto-generated by tools/generate-all-voices.py — do not edit manually.',
        '',
        'export const VOICE_CLIP_IDS = [',
    ]
    for cid in clips:
        lines.append(f"  '{cid}',")
    lines.extend([
        '] as const;',
        '',
        'export const MAP_VOICE_INDEX: Readonly<Record<string, string>> = {',
    ])
    for k, v in sorted(map_index.items()):
        lines.append(f"  '{k}': '{v}',")
    lines.extend([
        '};',
        '',
        'export const BARK_VOICE_INDEX: Readonly<Record<string, string>> = {',
    ])
    for k, v in sorted(bark_index.items()):
        lines.append(f"  '{k}': '{v}',")
    lines.extend([
        '};',
        '',
        'export const TEXT_VOICE_INDEX: Readonly<Record<string, string>> = {',
    ])
    for k, v in sorted(text_index.items()):
        lines.append(f"  '{k}': '{v}',")
    lines.extend([
        '};',
        '',
    ])
    with open(VOICE_CLIPS_TS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    print(f'Wrote {VOICE_CLIPS_TS} ({len(clips)} clips, {len(map_index)} map keys, {len(bark_index)} bark keys, {len(text_index)} text hashes)')


def update_assets_json(clips: dict[str, ClipSpec]) -> None:
    with open(ASSETS_JSON, encoding='utf-8') as f:
        manifest = json.load(f)

    existing_assets = [
        a for a in manifest.get('assets', []) if not str(a.get('path', '')).startswith('public/audio/voices/')
    ]
    for cid, spec in clips.items():
        rel_path = f'public/audio/voices/{cid}.m4a'
        if os.path.exists(os.path.join(ROOT_DIR, rel_path)):
            existing_assets.append({
                'path': rel_path,
                'license': 'own',
                'source': 'tools/generate-all-voices.py',
                'note': spec.note,
            })

    manifest['assets'] = existing_assets
    with open(ASSETS_JSON, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')
    print(f'Updated {ASSETS_JSON} ({len(existing_assets)} total manifest entries)')


def main() -> None:
    parser = argparse.ArgumentParser(description='Generate all Thornvael dialogue & bark voice clips.')
    parser.add_argument('--force', action='store_true', help='Regenerate even if .m4a already exists')
    parser.add_argument('--concurrency', type=int, default=12, help='Parallel edge-tts tasks')
    parser.add_argument('--skip-tts', action='store_true', help='Only regenerate TS index and assets.json')
    args = parser.parse_args()

    clips, map_index, bark_index, text_index = collect_clips()

    if not args.skip_tts:
        global edge_tts
        import edge_tts  # noqa: PLC0415

        asyncio.run(generate_audio(clips, args.force, args.concurrency))

    write_voice_clips_ts(clips, map_index, bark_index, text_index)
    update_assets_json(clips)


if __name__ == '__main__':
    main()
