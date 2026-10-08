import type { Classification, MoveRow } from './api'
import type { Side } from './replay'
import { cn } from './utils'

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

const MARKED: Classification[] = ['brilliant', 'great', 'miss', 'mistake', 'blunder']

/** How a move reads in a move list: the badge it carries (the standout ones only) and its
 * text color, your bad moves in red and the opponent's greyed. Without `me`, moves stay plain. */
export function moveLook(ply: number, move: MoveRow | undefined, me?: Side) {
  const kind = move?.classification
  const yours = me ? (ply % 2 === 1) === (me === 'white') : true
  const bad = !!me && yours && (kind === 'mistake' || kind === 'blunder' || kind === 'miss')
  return {
    badge: kind && MARKED.includes(kind) ? kind : null,
    className: cn(!yours && 'text-muted-foreground', bad && 'font-extrabold text-danger-text'),
  }
}
