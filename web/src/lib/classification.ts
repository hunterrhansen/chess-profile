import type { Classification } from './api'

/** Badge look for each move classification (thresholds live in analyze.py). Colors are the
 * --move-* tokens in styles/tokens.css; use them in CSS (style), not SVG attributes. */
export const CLASSIFICATION: Record<Classification, { label: string; color: string; symbol?: string }> = {
  brilliant: { label: 'Brilliant', color: 'var(--move-brilliant)', symbol: '!!' },
  great: { label: 'Great', color: 'var(--move-great)', symbol: '!' },
  best: { label: 'Best', color: 'var(--move-best)' },
  excellent: { label: 'Excellent', color: 'var(--move-excellent)' },
  good: { label: 'Good', color: 'var(--move-good)' },
  inaccuracy: { label: 'Inaccuracy', color: 'var(--move-inaccuracy)', symbol: '?!' },
  mistake: { label: 'Mistake', color: 'var(--move-mistake)', symbol: '?' },
  blunder: { label: 'Blunder', color: 'var(--move-blunder)', symbol: '??' },
  miss: { label: 'Miss', color: 'var(--move-miss)' },
}

/** Moves good enough that there's no better move worth drawing. */
export const SOUND: Classification[] = ['brilliant', 'great', 'best', 'excellent', 'good']

export function isSound(c: Classification | null) {
  return c == null || SOUND.includes(c)
}
