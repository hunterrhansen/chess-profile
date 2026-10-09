# Board sound analysis — October 9, 2026

## What was measured

Decoded the public Duolingo **web** correct, incorrect and lesson-passed MP3s to
16-bit PCM using macOS `afconvert`, then compared them with Knightly's WAV files.
This does not establish what Duolingo's current iOS chess lesson plays.

The public [Duolingo web bundle](https://d35aaqx5ub95lt.cloudfront.net/js/app-c397ede4.js)
maps `CORRECT`, `INCORRECT` and `PASSED` to these assets and sets playback gains
to 0.35, 0.35 and 0.5 respectively:

- [Correct](https://d35aaqx5ub95lt.cloudfront.net/sounds/37d8f0b39dcfe63872192c89653a93f6.mp3)
- [Incorrect](https://d35aaqx5ub95lt.cloudfront.net/sounds/f0b6ab4396d5891241ef4ca73b4de13a.mp3)
- [Lesson passed](https://d35aaqx5ub95lt.cloudfront.net/sounds/2aae0ea735c8e9ed884107d6f0a09e35.mp3)

Energy span means the interval between 5% and 95% cumulative squared-sample
energy. Frequency proportions use FFT power of decoded mono audio. Stereo files
were averaged to mono. These are signal measurements, not subjective loudness
ratings; codec padding and playback hardware affect comparisons.

| Cue | File length | 90% energy span | Energy below 1 kHz | Energy above 4 kHz |
| --- | ---: | ---: | ---: | ---: |
| Duolingo web correct | 1,166 ms | 235 ms | 4.4% | 1.2% |
| Duolingo web incorrect | 1,040 ms | 222 ms | 77.5% | 7.7% |
| Duolingo web lesson passed | 2,383 ms | 1,299 ms | 45.6% | 1.2% |
| Knightly move | 164 ms | 21 ms | 34.5% | 24.7% |
| Knightly capture | 198 ms | 53 ms | 36.4% | 23.8% |
| Knightly right | 592 ms | 167 ms | 34.0% | 0.0% |
| Knightly wrong | 452 ms | 184 ms | 100.0% | 0.0% |

## Findings and design implications

1. **Our physical impacts are very brief and broadband.** The generator uses
   noise rather than a resonant wooden body. Its substantial high-frequency
   energy plausibly contributes to the rough click; this is an inference from
   the waveform and user feedback, not a listening test of the references.
2. **Duolingo separates everyday feedback from completion.** Its web answer
   cues have about 220–235 ms of concentrated energy; lesson completion extends
   to about 1.3 seconds. Its gain configuration also distinguishes these roles.
3. **Correct and incorrect cues have different spectral identities.** Correct
   concentrates in 1–4 kHz, while incorrect has much more energy below 1 kHz.
   Our cues are mostly simple pitched oscillators and have limited timbral detail.

## Proposed original sound system

- **Move/capture:** start with original recordings of felt-bottomed wooden pieces
  on a wooden board. Trim room noise, preserve the first contact, shape the short
  body resonance, and keep enough headroom for captures. Use several subtly
  different takes to avoid repeating one identical click. Compare on phone
  speakers before fixing the final EQ and levels.
- **Correct/incorrect:** original short motifs with different tonal ranges and
  softer attacks. Keep everyday answer cues brief; reserve a longer resolved
  phrase for completion/checkmate. Treat the measured Duolingo values as reference
  observations, not universal targets for chess impacts.
- **Playback:** preload cues, give each event an explicit priority and gain,
  keep the physical landing cue separate from its grading cue, and align playback
  with landing/flash. Existing mate-versus-right suppression is a useful start.
- **Preferences:** preserve independent sound/haptic controls, silent-mode
  behavior and reduced motion. Sound variations should not alter grading or drag
  logic. Make future audio previews available before another replacement pass.

## Chess.com downloads and remaining mobile evidence

[Chess.com's help article](https://support.chess.com/en/articles/8704531-how-do-i-turn-off-sound)
confirms selectable move sounds, so the user's selected sound set matters.
The default sample links published in its
[forum](https://www.chess.com/forum/view/general/chessboard-sound-files?page=2)
initially returned HTTP 403 from this environment, as did the published alternate
web sample URL. A follow-up download with a browser user-agent and Chess.com
referer succeeded for the default move, capture, castle, check and game-end cues.
All five MP3s were verified by decoding to PCM. Duolingo correct, incorrect,
lesson-passed, bonus and lesson-failed cues were also downloaded and verified.
Reference files and their source/checksum manifest are stored separately from
the app assets. The initial table above contains the original Duolingo and
Knightly measurements; the follow-up Chess.com analysis and revision are below.

A short screen recording from each mobile app, with microphone off and internal
audio enabled, would resolve this: include a normal move, a capture and answer
feedback, separated by about one second. Specify Chess.com's selected sound set.
These recordings would also establish whether the Duolingo web samples match
the iOS chess experience. Keep third-party reference audio out of shipped assets;
use it to measure and compare original recordings/motifs.

## Implemented reference-guided revision

The downloaded Chess.com default web move has a 10 ms 90%-energy span, with
approximately 0% energy above 4 kHz; its strongest spectral peaks include 929
and 468 Hz. Its capture spans 15 ms, with 4% energy above 4 kHz and prominent
peaks around 1.1–1.5 kHz. This supports a very short, resonant impact rather than
our previous broadband noise and simulated double contact.

The generator now excites original damped, non-harmonic wood-body modes with a
2.5 ms contact and applies a two-stage 2.7 kHz low-pass filter. Capture raises
the body frequencies and level instead of layering a second knock. Existing
castle/check/promotion/mate sounds inherit the improved impact layer.

Correct uses an original G4–B4 motif with a rounded mallet attack and bright
decaying upper partials. Incorrect uses a lower, descending E5–B-flat4 motif
with the fundamental emphasized. Both retain a short tail and use modest
levels. No reference PCM was used in generating these assets.

| Cue | Previous 90% energy span | Revised span | Previous energy above 4 kHz | Revised energy above 4 kHz |
| --- | ---: | ---: | ---: | ---: |
| Move | 21 ms | 11 ms | 24.7% | 0.1% |
| Capture | 53 ms | 11 ms | 23.8% | 0.1% |
| Correct | 167 ms | 216 ms | 0% | 0% |
| Incorrect | 184 ms | 244 ms | 0% | 0% |

These metrics verify envelope/spectral changes, not perceptual equivalence.
Original assets are now bundled in the app; movement, grading, haptics and
playback scheduling are unchanged. Phone-speaker audition remains necessary.
