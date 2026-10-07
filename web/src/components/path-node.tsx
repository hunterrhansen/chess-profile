import { CheckIcon } from '@phosphor-icons/react'
import { type Glyph, KnIcon } from '@/components/kn-icon'
import { cn } from '@/lib/utils'

export type PathNodeState = 'done' | 'current' | 'locked' | 'check'

/**
 * A step on Home's path: done (a green check), current (bigger, ringed, with the step's icon
 * and an optional sky tag like "New game"), locked (grey), or the unit check (a crown). The
 * current one is a button that opens its lesson card.
 */
export function PathNode({
  state,
  glyph = 'review',
  label,
  tag,
  expanded,
  onClick,
  className,
}: {
  state: PathNodeState
  glyph?: Glyph
  label: string
  tag?: string
  expanded?: boolean
  onClick?: () => void
  className?: string
}) {
  const disc = {
    done: (
      <span className="grid size-[72px] place-items-center rounded-full bg-brand text-on-brand shadow-[0_6px_0_var(--brand-lip)]">
        <CheckIcon weight="bold" className="size-9" />
      </span>
    ),
    current: (
      <span className="relative m-2 grid size-[88px] place-items-center rounded-full bg-brand shadow-[0_6px_0_var(--brand-lip),0_0_0_8px_var(--surface-muted),0_6px_0_8px_var(--line)]">
        {/* The beacon pulses on its own ring so it doesn't replace the ledge's shadows. */}
        <span aria-hidden className="absolute -inset-2 animate-beacon rounded-full" />
        <KnIcon glyph={glyph} className="relative size-[46px]" />
      </span>
    ),
    locked: (
      <span className="grid size-[72px] place-items-center rounded-full bg-surface-muted shadow-[0_6px_0_var(--line)]">
        <KnIcon glyph={glyph} className="size-[34px] opacity-60 grayscale" />
      </span>
    ),
    check: (
      <span className="grid size-20 place-items-center rounded-full bg-surface-muted shadow-[0_6px_0_var(--line)]">
        <KnIcon glyph="crown" className="size-10" />
      </span>
    ),
  }[state]
  const body = (
    <>
      {tag && (
        <span className="rounded-md bg-sky px-3 py-1.5 text-xs font-extrabold tracking-[.06em] text-on-sky uppercase shadow-[0_3px_0_var(--sky-lip)]">
          {tag}
        </span>
      )}
      {disc}
      <span className={cn('max-w-56', state === 'current' ? 'text-[15px] font-extrabold' : 'text-sm text-muted-foreground')}>
        <span className="sr-only">{{ done: 'Done: ', current: 'Next: ', locked: 'Later: ', check: '' }[state]}</span>
        {label}
      </span>
    </>
  )
  const base = cn('flex flex-col items-center gap-2 text-center', className)
  return onClick ? (
    <button type="button" onClick={onClick} aria-expanded={expanded} className={cn(base, 'cursor-pointer rounded-xl')}>
      {body}
    </button>
  ) : (
    <div className={base}>{body}</div>
  )
}
