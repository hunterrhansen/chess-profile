import { Check, Star, ThumbsUp, X } from 'lucide-react'
import type { Classification } from '@/lib/api'
import { CLASSIFICATION } from '@/lib/classification'
import { cn } from '@/lib/utils'

const ICONS = { best: Star, excellent: ThumbsUp, good: Check, miss: X } as const

/** Round classification badge: an icon for good moves and misses, !! / ! for brilliant and
 * great moves, ?! / ? / ?? for errors. `pop` plays the landing animation once on mount (key
 * it by move to replay it): on the board it waits for the piece to land, and a Brilliant or
 * Great move sends a ring out as it lands. */
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
        pop && 'relative animate-pop [animation-delay:var(--duration-move)]',
        className,
      )}
    >
      {pop && (kind === 'brilliant' || kind === 'great') && (
        <span
          aria-hidden
          className="absolute inset-0 animate-ring rounded-full [animation-delay:calc(var(--duration-move)+var(--duration-pop)*0.4)]"
          style={{ backgroundColor: color }}
        />
      )}
      {Icon ? (
        <Icon className="relative size-3" strokeWidth={3} fill={kind === 'best' ? 'currentColor' : 'none'} />
      ) : (
        <span className="relative">{symbol}</span>
      )}
    </span>
  )
}
