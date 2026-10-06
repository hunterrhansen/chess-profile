import { cn } from '@/lib/utils'

/** The engine bar beside the board: White's share of the win chance, with the eval printed
 * on the side that's ahead. White's share sits at the bottom when you're White. */
export function EvalBar({
  whiteWin,
  score,
  whiteAtBottom,
}: {
  /** White's win chance, 0–100. */
  whiteWin: number
  /** "1.2", "M3", or null for none. */
  score: string | null
  whiteAtBottom: boolean
}) {
  const whiteAhead = whiteWin >= 50
  return (
    <div
      className={cn(
        'relative flex w-5 shrink-0 overflow-hidden rounded-md bg-eval-black ring-2 ring-line',
        whiteAtBottom ? 'flex-col-reverse' : 'flex-col',
      )}
      aria-label={`White's winning chance ${Math.round(whiteWin)}%`}
    >
      <div className="bg-eval-white transition-[height] duration-200" style={{ height: `${whiteWin}%` }} />
      {score && (
        <span
          className={cn(
            'absolute inset-x-0 text-center font-mono text-[9px] font-semibold',
            whiteAhead === whiteAtBottom ? 'bottom-1' : 'top-1',
            whiteAhead ? 'text-eval-black' : 'text-eval-white',
          )}
        >
          {score}
        </span>
      )}
    </div>
  )
}
