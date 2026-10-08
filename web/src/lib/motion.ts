import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { token } from '@/lib/tokens'

/** Motion helpers for the few animations CSS can't do alone. The timings live in
 * styles/tokens.css; the rules are in docs/design.md. */

const REDUCED = '(prefers-reduced-motion: reduce)'

/** True when the person asked their system for less motion. Things that exist only to move
 * (confetti) skip rendering; numbers jump straight to their value. */
export function useReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = matchMedia(REDUCED)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => matchMedia(REDUCED).matches,
  )
}

const BREAKPOINT = { md: '(min-width: 768px)', lg: '(min-width: 1024px)' }

/** True from the md breakpoint up (or `from`); below it, screens use their phone layout. */
export function useWide(from: keyof typeof BREAKPOINT = 'md') {
  const query = BREAKPOINT[from]
  return useSyncExternalStore(
    (onChange) => {
      const mq = matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => matchMedia(query).matches,
  )
}

/** A duration token in milliseconds, for libraries that want a number (the board). The
 * production build's CSS minifier rewrites `200ms` as `.2s`, so read the unit. */
export function durationMs(name: `--duration-${string}`) {
  const value = token(name).trim()
  const n = parseFloat(value) || 0
  return value.endsWith('ms') ? n : value.endsWith('s') ? n * 1000 : n
}

/** The board's piece slide, in ms (0 when reduced motion is on). */
export function useMoveMs() {
  const reduced = useReducedMotion()
  return reduced ? 0 : durationMs('--duration-move')
}

/** Counts from the last value shown (0 on first render, or `from`) to `value` over the fill
 * duration, easing out like a progress bar. */
export function useCountUp(value: number, { from = 0, duration }: { from?: number; duration?: number } = {}) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(from)
  const current = useRef(from) // where the count is now, so a new value starts from there

  useEffect(() => {
    if (reduced) return
    const start = current.current
    if (start === value) return
    const ms = duration ?? durationMs('--duration-fill')
    const t0 = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - t0) / ms)
      current.current = start + (value - start) * (1 - (1 - t) ** 3)
      setShown(current.current)
      if (t < 1) frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [value, reduced, duration])

  return reduced ? value : shown
}

/** A number that goes up each time `value` grows: key an element with it to replay a
 * one-shot animation (the progress bump, a "+12" float). */
export function useBumpOnIncrease(value: number) {
  const last = useRef(value)
  const [bumps, setBumps] = useState(0)
  useEffect(() => {
    if (value > last.current) setBumps((b) => b + 1)
    last.current = value
  }, [value])
  return bumps
}
