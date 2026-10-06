import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** The pieces of a stat tile: an eyebrow label, a big display-face number, a change. */
export function StatLabel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('eyebrow flex items-center justify-between gap-2', className)}>{children}</div>
}

export function StatValue({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('font-display text-4xl leading-none font-semibold tabular-nums', className)}>{children}</div>
  )
}

/** ▲ / ▼ and the amount. `better` decides the color: green when it went the right way, red
 * when it didn't (for blunders, down is better). */
export function StatDelta({ value, better, text }: { value: number; better: boolean; text?: string }) {
  return (
    <span className={cn('ml-2 font-sans text-sm font-extrabold', better ? 'text-brand-text' : 'text-danger-text')}>
      {value > 0 ? '▲' : '▼'} {text ?? Math.abs(value)}
    </span>
  )
}
