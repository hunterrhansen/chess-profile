import type { ReactNode } from 'react'
import { LogoLoader, LogoMark } from '@/components/logo'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** Nothing to show yet: the mark, a heading that says what's missing, a line on how to get
 * it, and the action that does. `compact` for a gap inside a card ("No games in this
 * period"), with a small mark and no heading weight. */
export function EmptyState({
  title,
  children,
  action,
  compact,
  className,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
  compact?: boolean
  className?: string
}) {
  if (compact) {
    return (
      <div className={cn('flex items-center gap-3 py-2', className)}>
        <LogoMark className="size-8" />
        <div className="min-w-0">
          <p className="font-bold">{title}</p>
          {children && <p className="text-sm text-muted-foreground">{children}</p>}
        </div>
        {action && <div className="ml-auto shrink-0">{action}</div>}
      </div>
    )
  }
  return (
    <div className={cn('flex flex-col items-center gap-4 px-4 py-10 text-center', className)}>
      <LogoMark className="size-16 animate-pop" />
      <div className="flex max-w-md flex-col gap-1.5">
        <h2 className="text-2xl font-semibold">{title}</h2>
        {children && <p className="text-muted-foreground">{children}</p>}
      </div>
      {action}
    </div>
  )
}

/** A skeleton the size of what's coming (so nothing jumps when it arrives), with the loader on
 * top: for the big blocks of a view, like the board or a chart. */
export function LoadingBlock({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Skeleton className="absolute inset-0 rounded-[inherit]" />
      <LogoLoader label={label} className="absolute inset-0 justify-center" />
    </div>
  )
}
