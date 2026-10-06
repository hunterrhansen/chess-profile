import type { Outcome } from '@/lib/api'
import { cn } from '@/lib/utils'

const RESULT = {
  win: { letter: 'W', className: 'bg-win/15 text-win' },
  loss: { letter: 'L', className: 'bg-loss/15 text-loss' },
  draw: { letter: 'D', className: 'bg-draw/15 text-draw' },
} as const

export function ResultBadge({ outcome }: { outcome: Outcome | null }) {
  if (!outcome) return null
  const { letter, className } = RESULT[outcome]
  return (
    <span
      aria-label={outcome}
      className={cn('inline-flex size-6 items-center justify-center rounded-md text-xs font-medium', className)}
    >
      {letter}
    </span>
  )
}

/** Which side the user played, as a small piece-colored dot. */
export function ColorDot({ color }: { color: 'white' | 'black' | null }) {
  if (!color) return null
  return (
    <span
      title={`You played ${color}`}
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full border border-foreground/40',
        color === 'black' ? 'bg-foreground' : 'bg-background',
      )}
    />
  )
}
