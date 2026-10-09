# Native chess board

`src/components/board.tsx` owns the board surface. It does not import routing,
authentication, API clients or grading logic. Existing practice screens keep
using their controlled `selected`, `targets` and `onSquare` props.

- Tap a piece, then a legal destination, or drag a piece directly. Invalid and
  off-board drops return home. Only the movable side can drag; it defaults to
  the side to move. `disabled` blocks all board input.
- A drag selects its source through `onSquare` and waits for that controlled
  selection to render before dispatching the destination. Consumers can instead
  supply `onMove(from, to)`; return `false` to reject a drop.
- Legal drops stay on the destination while the caller is grading. A rejected
  request (disabled becomes false without a new FEN) returns the piece home.
  Grading and FEN updates remain the caller's responsibility. Existing practice
  screens automatically promote to a queen, matching the web experience.
- Single moves and undo preserve piece identity, including both castling pieces,
  en passant and promotions. Position jumps and board flips snap immediately.
- `arrows` accepts `best`, `line`, and `danger`; `badge` accepts the web's nine
  classifications. `inLine` adds the blue analysis frame and last-move colors.
- Hints breathe until removed. A new mating move topples the losing king and
  brings in the mate and winner marks; reloads and revisits show the final frame.
- `soundEnabled={false}` silences board cues. Bundled WAVs reproduce the web's
  note/timing motifs offline. Move impacts use a short excitation of damped wood
  resonances with a low-pass finish; captures use a brighter, firmer strike.
  Correct/incorrect cues use rounded mallet attacks and decaying harmonics.
  These are original synthesized sounds, guided by reference measurements;
  no third-party audio samples are embedded. See `BOARD-SOUND-RESEARCH.md`.
  Regenerate with `python3 scripts/generate-board-sounds.py`. Playback uses the
  default audio session and does not request recording permissions.
- `hapticsEnabled={false}` silences tactile cues independently of sound. Native
  pickup/selection gets a light selection tick; a new grading result gets the same
  short tick at the scheduled moment of its square flash. Sound and color carry
  the correct/incorrect distinction, without stronger vibration patterns. Replays,
  flips and returning to a previous position do not trigger result pulses. No
  haptics are requested on web or while the app is inactive.
- Shared `Button` controls give one selection tick on press-in, alongside the
  existing pressed appearance. Disabled buttons remain silent; callers can pass
  `hapticsEnabled={false}` and their `onPressIn` handler remains intact.
- Only the moving piece gets a subtle landing compression; captures fade as the
  moving piece arrives. Checkmate uses its victory chord without a second correct
  answer chime. Already-played audio does not repeat when cue timing or preferences
  change.

Gesture Handler is rooted inside the board so navigation layouts need no changes.
Practice screens pass `edgeInset={20}` to expand the board into their horizontal
padding. On phones the squares reach both screen edges, while text and controls
keep their padding; wider screens retain the centered column width limit.
Animation runs through Reanimated shared values on the UI thread. System reduced
motion is applied to slides, pickup, return, feedback and mate sequences. Squares
remain labeled accessibility buttons underneath the decorative piece layer.

## Verification

From `mobile/`: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm tokens:check`,
`pnpm dlx expo-doctor`, and `pnpm export:ios`.

The web preview supports a quick local check: `pnpm web`, drag the first sample's
rook from e1 to e8, then try a diagonal invalid drop and repeat after flipping.
Browser checks do not establish native gesture performance or audio latency.
After adding these native dependencies, rebuild an existing development client
before device testing. Expo Go includes the SDK-compatible modules.

On a physical iPhone and Android, check an invalid drop, a canceled drag, rapid
selection, a drop while grading is pending, capture/castle/promotion/replay,
VoiceOver/TalkBack, reduced motion and audio with the silent switch enabled.
Judge animation feel in a release build on the slowest supported device.

## Feedback research (October 9, 2026)

[Duolingo's design team](https://blog.duolingo.com/duologues-design-conversations/)
describes personality through micro-interactions and sound.
[Rive's Duolingo case study](https://rive.app/blog/creative-technologists-duolingo-s-solution-to-the-designer-to-developer-handoff)
describes its animation workflow, but neither publishes the chess board's exact
haptic waveform or timings. Our cues are a design interpretation, not a claim to
reproduce its private implementation.

[Apple's audio-haptic guidance](https://developer.apple.com/videos/play/wwdc2019/810/)
informs coordinated sound and tactile feedback.
[Expo SDK 57 haptics](https://docs.expo.dev/versions/v57.0.0/sdk/haptics/)
supplies the system selection and result patterns and is supported in Expo Go.
Physical-phone testing is required to judge intensity and timing. iOS may suppress
haptics in Low Power Mode or when system haptics are disabled.
