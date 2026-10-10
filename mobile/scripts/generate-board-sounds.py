"""Render warm board knocks and short answer motifs as offline PCM assets.
Original synthesis guided by measured reference envelopes and spectral balance.
No reference samples are embedded. Native playback does not
need a browser audio graph, network connection or microphone permission.
Run from mobile/: python3 scripts/generate-board-sounds.py
"""
import math
import random
import struct
import wave
from pathlib import Path
RATE = 44100
DEST = Path(__file__).resolve().parent.parent / "assets" / "board-sounds"
DEST.mkdir(parents=True, exist_ok=True)
def render(name, knocks=(), bells=(), feedbacks=()):
    samples = [0.0] * int(RATE * 1.3)
    rng = random.Random(42)
    def add(at, seconds, signal):
        start = int(at * RATE)
        for i in range(int(seconds * RATE)):
            if start + i < len(samples):
                samples[start + i] += signal(i / RATE)
    for at, pitch, loud in knocks:
        # A tiny contact excites damped, non-harmonic wooden-body modes. Unlike
        # broadband noise, the resonators retain body without a hissy tail.
        impact = []
        modes = [(190, .22, 115), (445, .48, 150), (695, .3, 170),
                 (985, .7, 140), (1320, .12, 200)]
        states = [[0.0, 0.0] for _ in modes]
        coefficients = [(2 * math.exp(-decay / RATE) * math.cos(2 * math.pi * hz * pitch / RATE),
                         math.exp(-2 * decay / RATE), math.sin(2 * math.pi * hz * pitch / RATE), level)
                        for hz, level, decay in modes]
        filtered = filtered_again = 0.0
        alpha = 1 - math.exp(-2 * math.pi * 2700 / RATE)
        for _ in range(int(RATE * .22) + 1):
            t = len(impact) / RATE
            excitation = rng.uniform(-1, 1) * max(0, 1 - t / .0025) ** 2
            body = 0.0
            for state, (a, b, norm, level) in zip(states, coefficients):
                value = a * state[0] - b * state[1] + excitation
                state[1], state[0] = state[0], value
                body += value * norm * level
            filtered += alpha * (body - filtered)
            filtered_again += alpha * (filtered - filtered_again)
            impact.append(filtered_again)
        peak = max(abs(value) for value in impact)
        add(at, .22, lambda t: .58 * loud *
            impact[min(int(t * RATE), len(impact) - 1)] / peak)
    for at, freq, length, loud in bells:
        add(at, length, lambda t: loud * min(1, t / .008) * math.exp(-t * 8 / length) *
            sum(level * math.sin(2 * math.pi * freq * mult * t) for mult, level in [(1, 1), (2, .16), (3, .04)]))
    for at, freq, length, loud, bright in feedbacks:
        # Rounded mallet attack and decaying harmonics make a small instrument,
        # rather than a bare oscillator. Success has more upper-partial sparkle.
        partials = [(1, .24), (2, .38), (4, .72), (5, .1)] if bright else [(1, 1), (2, .18), (3, .06)]
        add(at, length, lambda t: loud * (1 - math.exp(-t / .008)) * math.exp(-t * 6 / length) *
            sum(level * math.sin(2 * math.pi * freq * mult * (t + .00012 * (1 - math.exp(-t / .018)))) *
                math.exp(-t * (mult - 1) * 1.5) for mult, level in partials))
    last = max(i for i, value in enumerate(samples) if abs(value) > .00001) + 100
    with wave.open(str(DEST / f"{name}.wav"), "wb") as output:
        output.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        output.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, value * .45)) * 32767)) for value in samples[:last]))
render("move", [(0, 1, 1)])
render("capture", [(0, 1.35, 1.12)])
render("castle", [(0, 1, 1), (.11, 1.08, .85)])
render("check", [(0, 1, 1)], [(.03, 1046.5, .25, .12)])
render("promote", [(0, 1, 1)], [(.05, 783.99, .2, .12), (.12, 1046.5, .35, .12)])
render("checkmate", [(0, .9, 1.2)], [(.12, freq, .9, .12) for freq in [523.25, 783.99, 1046.5]])
render("right", feedbacks=[(0, 392, .52, .13, True), (.125, 493.88, .6, .13, True)])
render("wrong", feedbacks=[(0, 659.25, .48, .18, False), (.125, 466.16, .6, .18, False)])
render("brilliant", bells=[(0, 1568, .3, .1), (.055, 2093, .3, .1), (.11, 2637, .45, .09)])
