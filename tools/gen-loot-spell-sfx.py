"""Generates crystalline loot identification and rune reveal audio for Thornvael.
Pure procedural synthesis: Python + numpy + FFmpeg.
Outputs public/audio/rune_reveal.m4a.
"""
import os
import subprocess
import tempfile
import wave
import numpy as np

SR = 44100
TAU = 2 * np.pi

def generate_rune_reveal():
    duration = 1.35
    t = np.linspace(0, duration, int(SR * duration), endpoint=False)
    out = np.zeros_like(t)

    # 1. Warm mystical sub-drone
    drone = np.sin(TAU * 130.81 * t) * np.exp(-t * 2.2) * 0.25
    out += drone

    # 2. Ascending crystalline chord: C5 (523.25), E5 (659.25), G5 (783.99), B5 (987.77), E6 (1318.5)
    notes = [
        (0.00, 523.25, 0.40, 2.5),
        (0.08, 659.25, 0.45, 2.8),
        (0.16, 783.99, 0.50, 3.0),
        (0.24, 987.77, 0.55, 3.2),
        (0.32, 1318.51, 0.60, 3.5),
        (0.40, 2093.00, 0.35, 4.0),
    ]

    for start_t, freq, amp, decay in notes:
        idx = int(start_t * SR)
        sub_t = t[:len(t) - idx]
        # Pure fundamental + bell harmonic (2.76x and 4.07x)
        tone = (
            np.sin(TAU * freq * sub_t) * 0.7 +
            np.sin(TAU * freq * 2.76 * sub_t) * 0.2 +
            np.sin(TAU * freq * 4.07 * sub_t) * 0.1
        )
        env = np.exp(-sub_t * decay)
        # Fast attack
        attack_n = int(0.008 * SR)
        if len(env) > attack_n:
            env[:attack_n] *= np.linspace(0, 1, attack_n)
        out[idx:idx + len(sub_t)] += tone * env * amp

    # 3. High shimmer sparkle noise
    rng = np.random.default_rng(20261117)
    sparkle = rng.standard_normal(len(t))
    # Bandpass filter for crystal sparkle
    f = np.fft.rfftfreq(len(t), 1 / SR)
    bp = np.exp(-((f - 4200) ** 2) / (2 * (1200 ** 2)))
    sparkle_filtered = np.fft.irfft(np.fft.rfft(sparkle) * bp, len(t))
    sparkle_env = np.sin(np.pi * np.clip(t / 0.8, 0, 1)) * np.exp(-t * 2.0)
    out += sparkle_filtered * sparkle_env * 0.15

    # Normalize to -1.5 dB
    peak = np.max(np.abs(out))
    if peak > 0:
        out = (out / peak) * 0.85

    return out

def encode_aac(samples, out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tf:
        wav_path = tf.name

    try:
        int_data = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
        with wave.open(wav_path, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(SR)
            wf.writeframes(int_data.tobytes())

        cmd = [
            'ffmpeg', '-y', '-loglevel', 'error',
            '-i', wav_path,
            '-c:a', 'aac', '-b:a', '64k',
            '-movflags', '+faststart',
            out_path
        ]
        res = subprocess.run(cmd, check=True)
        print(f"Generated {out_path} ({len(samples)/SR:.2f}s)")
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)

if __name__ == '__main__':
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    out_file = os.path.join(root, 'public', 'audio', 'rune_reveal.m4a')
    samples = generate_rune_reveal()
    encode_aac(samples, out_file)
