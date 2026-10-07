import { CheckIcon, StarIcon, ThumbsUpIcon, XIcon } from '@phosphor-icons/react'
import { useEffect } from 'react'
import type { Classification } from '@/lib/api'
import { CLASSIFICATION } from '@/lib/classification'
import { durationMs } from '@/lib/motion'
import { playSound } from '@/lib/sound'
import { cn } from '@/lib/utils'

const ICONS = { best: StarIcon, excellent: ThumbsUpIcon, good: CheckIcon, miss: XIcon } as const

/** Round classification badge: an icon for good moves and misses, !! / ! for brilliant and
 * great moves, ?! / ? / ?? for errors. `pop` plays the landing animation once on mount (key
 * it by move to replay it): on the board it waits for the piece to land, and a Brilliant or
 * Great move sends a ring out, with a sparkle, as it lands. */
export function MoveBadge({ kind, pop, className }: { kind: Classification; pop?: boolean; className?: string }) {
  const { label, color, symbol } = CLASSIFICATION[kind]
  const Icon = kind in ICONS ? ICONS[kind as keyof typeof ICONS] : null
  const special = kind === 'brilliant' || kind === 'great'
  useEffect(() => {
    if (pop && special) return playSound('brilliant', durationMs('--duration-move') + durationMs('--duration-pop') * 0.4)
  }, [pop, special])
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
      {pop && special && (
        <span
          aria-hidden
          className="absolute inset-0 animate-ring rounded-full [animation-delay:calc(var(--duration-move)+var(--duration-pop)*0.4)]"
          style={{ backgroundColor: color }}
        />
      )}
      {Icon ? (
        <Icon className="relative size-3" weight={kind === 'best' || kind === 'excellent' ? 'fill' : 'bold'} />
      ) : (
        <span className="relative">{symbol}</span>
      )}
    </span>
  )
}
