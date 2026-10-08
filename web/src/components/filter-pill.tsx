import { cn } from '@/lib/utils'

/** A quick filter (Games): its label and count, the chosen one in ink. Use inside a
 * `role="tablist"`. */
export function FilterPill({ label, count, on, onClick }: { label: string; count?: number; on: boolean; onClick: () => void }) {
  return (
    <button
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3.5 text-sm font-extrabold transition-colors',
        on ? 'bg-foreground text-background' : 'bg-card text-foreground shadow-[inset_0_0_0_2px_var(--line),0_2px_0_var(--lip)] hover:bg-muted',
      )}
    >
      {label}
      {count != null && (
        <span className={cn('rounded-sm px-1.5 py-0.5 text-xs tabular-nums', on ? 'bg-background/20' : 'bg-surface-muted text-muted-foreground')}>
          {count}
        </span>
      )}
    </button>
  )
}
