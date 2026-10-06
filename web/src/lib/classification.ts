import type { Classification } from './api'

/** Badge look for each move classification (thresholds live in analyze.py). */
export const CLASSIFICATION: Record<Classification, { label: string; color: string; symbol?: string }> = {
  best: { label: 'Best', color: '#639922' },
  excellent: { label: 'Excellent', color: '#97C459' },
  good: { label: 'Good', color: '#888780' },
  inaccuracy: { label: 'Inaccuracy', color: '#EF9F27', symbol: '?!' },
  mistake: { label: 'Mistake', color: '#D85A30', symbol: '?' },
  blunder: { label: 'Blunder', color: '#E24B4A', symbol: '??' },
  miss: { label: 'Miss', color: '#D4537E' },
}

/** Moves good enough that there's no better move worth drawing. */
export const SOUND: Classification[] = ['best', 'excellent', 'good']

export function isSound(c: Classification | null) {
  return c == null || SOUND.includes(c)
}
