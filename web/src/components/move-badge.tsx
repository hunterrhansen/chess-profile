import { Check, Star, ThumbsUp, X } from 'lucide-react'
import type { Classification } from '@/lib/api'
import { CLASSIFICATION } from '@/lib/classification'
import { cn } from '@/lib/utils'

const ICONS = { best: Star, excellent: ThumbsUp, good: Check, miss: X } as const

/** Round classification badge: an icon for good moves and misses, !! / ! for brilliant and
 * great moves, ?! / ? / ?? for errors. `pop` plays the landing animation once on mount (key
 * it by move to replay it). */
export function MoveBadge({ kind, pop, className }: { kind: Classification; pop?: boolean; className?: string }) {
  const { label, color, symbol } = CLASSIFICATION[kind]
  const Icon = kind in ICONS ? ICONS[kind as keyof typeof ICONS] : null
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      style={{ backgroundColor: color }}
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black tracking-tighter text-on-move shadow-[inset_0_-2px_0_var(--move-shade)]',
        pop && 'animate-pop',
        className,
      )}
    >
      {Icon ? <Icon className="size-3" strokeWidth={3} fill={kind === 'best' ? 'currentColor' : 'none'} /> : symbol}
    </span>
  )
}
