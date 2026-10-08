import { ArrowRightIcon } from '@phosphor-icons/react'
import { Link } from 'react-router'
import { KnIcon } from '@/components/kn-icon'
import { cn } from '@/lib/utils'

/**
 * A unit on Progress: one of your numbers. Unit 1 (your weakest, "Now") is brand with its unit
 * check's bar; the others are locked until it's done, or done. The whole card links to the games
 * behind the number.
 */
export function UnitCard({
  n,
  title,
  lead,
  done,
  value,
  suffix,
  line,
  check,
  to,
  linkText,
}: {
  n: number
  title: string
  lead: boolean
  done: boolean
  value: React.ReactNode
  suffix: string
  /** Under the number: the change and the target (lead) or some context. */
  line: React.ReactNode
  /** The lead unit's check: 0 to 1, and what it says. */
  check?: { progress: number; text: string }
  to: string
  linkText: string
}) {
  return (
    <Link
      to={to}
      className={cn('panel panel-link flex h-full flex-col gap-2 p-5', lead && 'border-brand-lip bg-brand text-on-brand shadow-[0_4px_0_var(--brand-lip)]')}
    >
      <div className="flex items-center justify-between">
        <span className={cn('text-xs font-extrabold tracking-[.06em] uppercase', !lead && 'text-muted-foreground')}>
          Unit {n}
          {lead ? ' · Now' : done ? ' · Done' : ''}
        </span>
        {!lead && !done && <KnIcon glyph="lock" className="size-6" />}
        {done && <KnIcon glyph="check" className="size-6" />}
      </div>
      <h3 className="font-heading text-lg font-semibold">{title}</h3>
      <p className="font-heading text-3xl font-bold">
        {value}
        <span className={cn('font-sans text-base font-semibold', !lead && 'text-muted-foreground')}> {suffix}</span>
      </p>
      <p className="text-sm font-extrabold">{line}</p>
      {lead && check && (
        <>
          <div className="mt-1 h-3 overflow-hidden rounded-full bg-brand-lip">
            <div className="h-full rounded-full bg-on-brand" style={{ width: `${Math.max(4, check.progress * 100)}%` }} />
          </div>
          <p className="text-[13px] font-extrabold">Unit check: {check.text}</p>
        </>
      )}
      <span className={cn('mt-auto flex items-center gap-1 pt-1 text-xs', lead ? 'font-bold' : 'text-muted-foreground')}>
        {linkText} <ArrowRightIcon className="size-3" />
      </span>
    </Link>
  )
}
