"""Render the camp ambience from the edited mono hearth recording. Requires NumPy."""
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art-source/ashen-labyrinth/audio/hearth-mono.wav'
TARGET = ROOT / 'assets/resources/audio/campfire.wav'


def rms(signal):
    return np.sqrt(np.mean(signal ** 2))


def render():
    with wave.open(str(SOURCE), 'rb') as source:
        rate = source.getframerate()
        assert source.getnchannels() == 1 and source.getsampwidth() == 2
        fire = np.frombuffer(source.readframes(source.getnframes()), '<i2') / 32768.
    size = len(fire)
    seconds = np.arange(size) / rate
    duration = size / rate
    phase = 2 * np.pi * seconds / duration
    rng = np.random.default_rng(1764)
    hz = np.fft.rfftfreq(size, 1 / rate)

    def air_band(low, high):
        # Filtering in the frequency domain keeps both ends of the loop continuous.
        spectrum = np.fft.rfft(rng.normal(size=size))
        response = hz / np.hypot(hz, low) / np.sqrt(1 + (hz / high) ** 4)
        noise = np.fft.irfft(spectrum * response, n=size)
        return noise / rms(noise)

    breeze = air_band(160, 630) * (0.70 + 0.19 * np.sin(phase) + 0.11 * np.cos(3 * phase))
    width = air_band(260, 900) * (0.65 + 0.25 * np.sin(2 * phase + 0.8))
    canvas = np.zeros(size)
    # Short, soft movements of the awning sit well behind the central hearth.
    for start, length in [(5.8, 1.2), (18.6, 1.7), (24.8, 0.9)]:
        age = np.clip((seconds - start) / length, 0, 1)
        canvas += np.sin(np.pi * age) ** 2
    cloth = air_band(850, 2100) * canvas
    air = np.column_stack((breeze + 0.42 * width + 0.27 * cloth,
                           breeze - 0.42 * width + 0.16 * cloth))
    air *= rms(fire) * 10 ** (-17 / 20) / rms(air)
    mix = fire[:, None] + air
    if np.max(np.abs(mix)) >= 1:
        raise ValueError('Camp mix clips')
    with wave.open(str(TARGET), 'wb') as target:
        target.setparams((2, 2, rate, 0, 'NONE', 'not compressed'))
        target.writeframes(np.rint(mix * 32767).astype('<i2').tobytes())
    print(f'{duration:g} s, fire RMS {rms(fire):.5f}, ambience RMS {rms(air):.5f}, mix RMS {rms(mix):.5f}')


if __name__ == '__main__':
    render()
