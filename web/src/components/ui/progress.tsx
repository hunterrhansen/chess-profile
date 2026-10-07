import { useBumpOnIncrease } from '@/lib/motion'
import { cn } from '@/lib/utils'

const FILL = { brand: 'bg-brand', sky: 'bg-sky', gold: 'bg-gold' } as const

/** A thick rounded bar with a highlight stripe. `gold` only when it shows a record or a full
 * goal. Give it a `label` (shown, or for screen readers only with `hideLabel`). The fill
 * eases to a new value, and lights up for a moment each time it grows. */
export function Progress({
  value,
  label,
  valueText,
  hideLabel,
  tone = 'brand',
  size = 'default',
  className,
}: {
  /** 0–100 */
  value: number
  label: string
  /** Replaces the default "NN%" beside the label. */
  valueText?: string
  hideLabel?: boolean
  tone?: keyof typeof FILL
  size?: 'default' | 'sm'
  className?: string
}) {
  const v = Math.max(0, Math.min(100, value))
  const grew = useBumpOnIncrease(v)
  return (
    <div className={cn('grid gap-1.5', className)}>
      {!hideLabel && (
        <div className="flex justify-between text-sm font-extrabold">
          <span>{label}</span>
          <span className="tabular-nums">{valueText ?? `${Math.round(v)}%`}</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(v)}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn('overflow-hidden rounded-full bg-surface-muted', size === 'sm' ? 'h-2.5' : 'h-4')}
      >
        {v > 0 && (
          <div
            className={cn(
              'relative h-full min-w-(--h) rounded-full transition-[width] duration-(--duration-fill) ease-out',
              size === 'sm' ? '[--h:--spacing(2.5)]' : '[--h:--spacing(4)]',
              FILL[tone],
              // the highlight stripe along the top of the fill
              size === 'default' && 'after:absolute after:inset-x-2 after:top-1 after:h-1 after:rounded-full after:bg-sheen',
            )}
            style={{ width: `${v}%` }}
          >
            {grew > 0 && (
              <span key={grew} className="absolute inset-0 animate-flash rounded-full bg-sheen [animation-delay:var(--duration-quick)]" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
