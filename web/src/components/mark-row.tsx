import { type Mark, MARKS } from '@/lib/marks'
import { cn } from '@/lib/utils'

/**
 * One mark per position or key moment, in order (Review complete, Done for today). Each says
 * how it went in its aria-label (`name` names the position), so it's never color alone.
 */
export function MarkRow({
  marks,
  className,
  barClassName = 'h-3.5',
}: {
  marks: { key: string | number; mark: Mark; name: string }[]
  className?: string
  /** The bars' height. */
  barClassName?: string
}) {
  return (
    <div className={cn('flex gap-1.5', className)}>
      {marks.map((m) => (
        <span
          key={m.key}
          role="img"
          aria-label={`${m.name}: ${MARKS[m.mark].label}`}
          className={cn('flex-1 rounded-full', barClassName, MARKS[m.mark].className)}
        />
      ))}
    </div>
  )
}
