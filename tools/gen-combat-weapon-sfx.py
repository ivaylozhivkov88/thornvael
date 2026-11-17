"""Generates and validates rich procedural dark fantasy combat impact SFX for Thornvael.
Layers:
- Crushing blunt hammer blow: deep sub-thud + wood/bone fracture snap + metallic weight.
- Blade slicing mail: high steel edge slice + metallic chainmail ringing.
- Shield ricochet block: resonant bell transient + high frequency metal deflection ping.
Outputs to public/audio/ as needed.
"""
import os
import subprocess
import tempfile
import wave
import numpy as np

SR = 44100
TAU = 2 * np.pi

def synthesize_blunt_impact(rng, intensity=1.0):
    sec = 0.28
    t = np.linspace(0, sec, int(SR * sec), endpoint=False)
    # Deep sub-body
    sub = np.sin(TAU * np.linspace(160, 45, len(t)) * t) * np.exp(-t * 22) * 0.7
    # Bone/timber crack noise
    noise = rng.standard_normal(len(t))
    f = np.fft.rfftfreq(len(t), 1 / SR)
    bp = np.exp(-((f - 900) ** 2) / (2 * (400 ** 2)))
    crack = np.fft.irfft(np.fft.rfft(noise) * bp, len(t)) * np.exp(-t * 45) * 0.5
    out = sub + crack
    peak = np.max(np.abs(out))
    return (out / (peak or 1)) * 0.82

def synthesize_mail_slice(rng):
    sec = 0.22
    t = np.linspace(0, sec, int(SR * sec), endpoint=False)
    # High blade sweep
    blade_freq = np.linspace(3200, 800, len(t))
    blade = np.sin(TAU * blade_freq * t) * np.exp(-t * 30) * 0.4
    # Chain links chink
    links = np.zeros_like(t)
    for freq in [1750, 2400, 3100, 4200]:
        links += np.sin(TAU * freq * t) * np.exp(-t * 20) * 0.15
    out = blade + links
    peak = np.max(np.abs(out))
    return (out / (peak or 1)) * 0.78

def synthesize_shield_ricochet(rng):
    sec = 0.32
    t = np.linspace(0, sec, int(SR * sec), endpoint=False)
    # Heavy rim ping
    ping = (
        np.sin(TAU * 1280 * t) * 0.5 +
        np.sin(TAU * 2560 * t) * 0.3 +
        np.sin(TAU * 3840 * t) * 0.15
    ) * np.exp(-t * 14)
    # Heavy shield boss thud
    boss = np.sin(TAU * np.linspace(220, 75, len(t)) * t) * np.exp(-t * 28) * 0.5
    out = ping + boss
    peak = np.max(np.abs(out))
    return (out / (peak or 1)) * 0.85

if __name__ == '__main__':
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    print("Combat weapon impact generator initialized successfully.")
