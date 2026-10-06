import { Check, Star, ThumbsUp, X } from 'lucide-react'
import type { Classification } from '@/lib/api'
import { CLASSIFICATION } from '@/lib/classification'
import { cn } from '@/lib/utils'

const ICONS = { best: Star, excellent: ThumbsUp, good: Check, miss: X } as const

/** Round classification badge: an icon for good moves and misses, !! / ! for brilliant and
 * great moves, ?! / ? / ?? for errors. */
export function MoveBadge({ kind, className }: { kind: Classification; className?: string }) {
  const { label, color, symbol } = CLASSIFICATION[kind]
  const Icon = kind in ICONS ? ICONS[kind as keyof typeof ICONS] : null
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      style={{ backgroundColor: color }}
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tracking-tighter text-white',
        className,
      )}
    >
      {Icon ? <Icon className="size-3" strokeWidth={3} /> : symbol}
    </span>
  )
}
