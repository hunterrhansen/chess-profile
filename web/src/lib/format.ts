import type { Range } from './api'

export const RANGE_LABEL: Record<Range, string> = { '30d': '30 days', '90d': '90 days', all: 'All time' }

export function pct(value: number | null | undefined, digits = 0) {
  return value == null ? '—' : `${(value * 100).toFixed(digits)}%`
}

export function num(value: number | null | undefined, digits = 0) {
  return value == null ? '—' : value.toFixed(digits)
}

export function signed(value: number, digits = 0) {
  const s = Math.abs(value).toFixed(digits)
  return value > 0 ? `+${s}` : value < 0 ? `−${s}` : s
}

export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function longDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "600" -> "10 min", "180+2" -> "3+2", "1/259200" -> "3 days/move" */
export function timeControl(tc: string | null) {
  if (!tc) return null
  if (tc.startsWith('1/')) {
    const days = Number(tc.slice(2)) / 86400
    return `${days} day${days === 1 ? '' : 's'}/move`
  }
  const [base, inc] = tc.split('+').map(Number)
  if (!inc) return `${base / 60} min`
  return `${base / 60}+${inc}`
}

export function openingLabel(opening: string | null, eco: string | null) {
  return opening ?? eco ?? 'Unknown opening'
}

/** "Bxd4+" -> ["B", "xd4+"]; pawn moves and castling have no piece letter. */
export function splitPiece(san: string): [string | null, string] {
  return 'KQRBN'.includes(san[0]) ? [san[0], san.slice(1)] : [null, san]
}

/** Clock display: 9:05, 0:05. */
export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Thinking time: 2.6s under a minute, 1:38 above. */
export function thinkTime(seconds: number) {
  return seconds >= 60 ? clock(seconds) : `${seconds.toFixed(1)}s`
}
