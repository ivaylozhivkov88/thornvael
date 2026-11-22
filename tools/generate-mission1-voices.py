#!/usr/bin/env python3
"""
Generate natural neural human speech lines for Thornvael Act 1 cutscenes and briefings.
Uses high-fidelity neural voices with character-specific pitches and rates.
Outputs clean AAC-LC .m4a files for streaming in the Web Audio voice bus.
"""
import os
import subprocess
import asyncio
import edge_tts

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICES_DIR = os.path.join(ROOT_DIR, 'public', 'audio', 'voices')
os.makedirs(VOICES_DIR, exist_ok=True)

LINES = [
    (
        'cs_act1_start_01_narrator',
        'Cold drizzle turns Thornwick market square into churned ochre paste as watch-bells clang from the river gate.',
        'en-GB-RyanNeural',
        '+0Hz',
        '-3%'
    ),
    (
        'cs_act1_start_02_garrick',
        'Three patrols overdue from Sunken Ford, and now smoke is rising off the tollhouse roof.',
        'en-GB-ThomasNeural',
        '-4Hz',
        '-4%'
    ),
    (
        'cs_act1_start_03_garrick',
        'You heard the commander. Check your cinch-straps—nobody gets buried on company time.',
        'en-GB-ThomasNeural',
        '-4Hz',
        '-2%'
    ),
    (
        'm01_briefing_hale',
        'Blood at the Ford. Hostile warbands have breached the frontier riverbanks and fired the watch outposts. Rally your vanguard, advance across the shallows under covering fire, and strike down their warlord before our lines are encircled.',
        'en-GB-RyanNeural',
        '-6Hz',
        '-4%'
    ),
]

async def generate():
    for key, text, voice, pitch, rate in LINES:
        mp3 = os.path.join(VOICES_DIR, f'{key}.mp3')
        m4a = os.path.join(VOICES_DIR, f'{key}.m4a')
        comm = edge_tts.Communicate(text, voice, pitch=pitch, rate=rate)
        await comm.save(mp3)
        subprocess.run(
            ['ffmpeg', '-y', '-i', mp3, '-c:a', 'aac', '-b:a', '64k', m4a],
            capture_output=True,
            check=True
        )
        if os.path.exists(mp3):
            os.remove(mp3)
        print(f'Generated {m4a} ({os.path.getsize(m4a)} bytes)')

if __name__ == '__main__':
    asyncio.run(generate())
