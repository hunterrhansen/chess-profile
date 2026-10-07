import { Chess, type Move } from 'chess.js'
import { useEffect, useRef } from 'react'

/**
 * The app's sounds, made with the Web Audio API (no files): a wooden piece on a wooden board,
 * chimes for the rewards. Each one pairs with an animation and plays at the moment it lands
 * (docs/design.md, Sound). Off in Settings turns them all off.
 */

export type SoundName =
  | 'move'
  | 'capture'
  | 'check'
  | 'castle'
  | 'promote'
  | 'right'
  | 'wrong'
  | 'brilliant'
  | 'win'
  | 'gameOver'
  | 'celebrate'

let enabled = true
let ctx: AudioContext | null = null
let out: GainNode | null = null

/** Set from the preferences; every sound checks it. */
export function setSoundEnabled(on: boolean) {
  enabled = on
}

function audio() {
  if (!ctx) {
    ctx = new AudioContext()
    out = ctx.createGain()
    out.gain.value = 0.45
    out.connect(ctx.destination)
  }
  // Browsers start audio suspended until the page has had a click or a key press.
  if (ctx.state === 'suspended') void ctx.resume()
  return { ac: ctx, dest: out! }
}

/** A noise burst, decaying fast: what strikes the wood in `knock`. */
function burst(ac: AudioContext, seconds: number, curve: number) {
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** curve
  const src = ac.createBufferSource()
  src.buffer = buf
  return src
}

/**
 * A wooden piece set down on a wooden board: a short strike rings a few narrow resonances
 * (the piece's body), over a soft low thud (the board). Each one is pitched a little
 * differently, so stepping through a game doesn't sound like a metronome.
 */
function knock(at: number, { pitch = 1, loud = 1 } = {}) {
  const { ac, dest } = audio()
  const t = ac.currentTime + at
  const p = pitch * (0.96 + Math.random() * 0.08)

  // the piece: three resonances of a small block of wood
  const strike = burst(ac, 0.03, 4)
  for (const [freq, q, level] of [[820, 9, 1], [1650, 11, 0.5], [3100, 14, 0.22]] as const) {
    const band = ac.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = freq * p
    band.Q.value = q
    const g = ac.createGain()
    g.gain.value = level * 2.6 * loud
    strike.connect(band).connect(g).connect(dest)
  }
  strike.start(t)

  // the board: a muffled, very short thud under it
  const thump = burst(ac, 0.05, 2)
  const low = ac.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 260 * p
  const g = ac.createGain()
  g.gain.value = 0.9 * loud
  thump.connect(low).connect(g).connect(dest)
  thump.start(t)
}

/** A bell-like note: a sine with two soft overtones, a quick attack and a long tail. */
function bell(at: number, freq: number, { length = 0.45, loud = 0.25, wave = 'sine' as OscillatorType } = {}) {
  const { ac, dest } = audio()
  const t = ac.currentTime + at
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(loud, t + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
  gain.connect(dest)
  for (const [mult, level] of [[1, 1], [2, 0.3], [3, 0.12]] as const) {
    const osc = ac.createOscillator()
    osc.type = wave
    osc.frequency.value = freq * mult
    const g = ac.createGain()
    g.gain.value = level
    osc.connect(g).connect(gain)
    osc.start(t)
    osc.stop(t + length + 0.05)
  }
}

/** A soft, low, falling buzz: "not that one", firm but not harsh. */
function thud(at: number, from: number, to: number, length: number) {
  const { ac, dest } = audio()
  const t = ac.currentTime + at
  const osc = ac.createOscillator()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(from, t)
  osc.frequency.exponentialRampToValueAtTime(to, t + length)
  const low = ac.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 900
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.35, t + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
  osc.connect(low).connect(gain).connect(dest)
  osc.start(t)
  osc.stop(t + length + 0.05)
}

// note frequencies
const C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.5, G6 = 1568, C7 = 2093

const SOUNDS: Record<SoundName, () => void> = {
  move: () => knock(0),
  // the taken piece clacks against the one landing on it
  capture: () => {
    knock(0, { pitch: 1.2, loud: 1.15 })
    knock(0.025, { pitch: 0.9, loud: 0.6 })
  },
  // king, then rook
  castle: () => {
    knock(0)
    knock(0.11, { pitch: 1.08, loud: 0.85 })
  },
  check: () => {
    knock(0)
    bell(0.03, C6, { length: 0.25, loud: 0.12, wave: 'triangle' })
  },
  promote: () => {
    knock(0)
    bell(0.05, G5, { length: 0.2, loud: 0.12 })
    bell(0.12, C6, { length: 0.35, loud: 0.12 })
  },
  // a bright two-note rise, the right-answer chime
  right: () => {
    bell(0, A5, { length: 0.3, loud: 0.22 })
    bell(0.09, E6, { length: 0.5, loud: 0.22 })
  },
  wrong: () => {
    thud(0, 330, 290, 0.14)
    thud(0.13, 262, 196, 0.32)
  },
  // a quick sparkle as a Brilliant or Great badge lands
  brilliant: () => {
    bell(0, G6, { length: 0.3, loud: 0.1 })
    bell(0.055, C7, { length: 0.3, loud: 0.1 })
    bell(0.11, E6 * 2, { length: 0.45, loud: 0.09 })
  },
  win: () => {
    bell(0, C5, { loud: 0.2 })
    bell(0.11, E5, { loud: 0.2 })
    bell(0.22, G5, { length: 0.8, loud: 0.22 })
  },
  // a loss or a draw: the game is over, quietly
  gameOver: () => {
    bell(0, G5, { length: 0.35, loud: 0.15 })
    bell(0.16, C5, { length: 0.7, loud: 0.15 })
  },
  // the confetti fanfare: an arpeggio up to a held chord
  celebrate: () => {
    ;[C5, E5, G5, C6].forEach((f, i) => bell(i * 0.08, f, { length: 0.35, loud: 0.18 }))
    for (const f of [C6, E6, G6]) bell(0.34, f, { length: 1.1, loud: 0.1 })
  },
}

/** Plays a sound on the next tick, or after `delayMs` to land with an animation. Returns a
 * cancel for an effect to clean up with, so React's double run of effects in development
 * still plays it once. */
export function playSound(name: SoundName, delayMs = 0): () => void {
  const timer = setTimeout(() => playNow(name), Math.max(0, delayMs))
  return () => clearTimeout(timer)
}

function playNow(name: SoundName) {
  if (!enabled || typeof AudioContext === 'undefined' || document.hidden) return
  try {
    SOUNDS[name]()
  } catch {
    // no audio device: stay silent
  }
}

/** The sound for one move: castle, promotion, check, capture, or a plain move. */
export function soundForMove(m: Move): SoundName {
  if (m.san.includes('+') || m.san.includes('#')) return 'check'
  if (m.isKingsideCastle() || m.isQueensideCastle()) return 'castle'
  if (m.isPromotion()) return 'promote'
  if (m.isCapture()) return 'capture'
  return 'move'
}

const placement = (fen: string) => fen.split(' ').slice(0, 2).join(' ')

/** What it sounds like to go from one position to the next: the move's sound when it's one
 * move forward, a plain move when it's one move back, nothing for a jump. */
export function soundBetween(before: string, after: string): SoundName | null {
  try {
    const target = placement(after)
    const forward = new Chess(before).moves({ verbose: true }).find((m) => placement(m.after) === target)
    if (forward) return soundForMove(forward)
    const origin = placement(before)
    if (new Chess(after).moves({ verbose: true }).some((m) => placement(m.after) === origin)) return 'move'
  } catch {
    // not a legal position pair
  }
  return null
}

/** A board's sounds: whenever the position it shows changes by one move, play that move
 * as the piece lands: after `delayMs` (the board's slide), or at once when `landed()` says the
 * piece was dropped there by hand. */
export function useMoveSound(fen: string, delayMs = 0, landed?: () => boolean) {
  const shown = useRef(fen)
  useEffect(() => {
    const before = shown.current
    shown.current = fen
    if (before === fen) return
    // Not cancelled on cleanup: the ref above already keeps a double-run effect from
    // repeating it, and a quick next step should still hear this one land.
    const name = soundBetween(before, fen)
    if (name) setTimeout(() => playNow(name), landed?.() ? 0 : delayMs)
  }, [fen, delayMs, landed])
}
