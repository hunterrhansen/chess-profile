import { cn } from '@/lib/utils'

type Tone = 'idle' | 'retry' | 'right' | 'wrong' | 'gold'

const BAND: Record<Tone, string> = {
  idle: 'border-border bg-background',
  // after a miss, before you've found it: a light red, "Not quite"
  retry: 'border-danger bg-[color-mix(in_srgb,var(--danger)_10%,var(--card))]',
  right: 'border-brand bg-[color-mix(in_srgb,var(--brand)_20%,var(--card))]',
  wrong: 'border-danger bg-[color-mix(in_srgb,var(--danger)_16%,var(--card))]',
  gold: 'border-gold bg-[color-mix(in_srgb,var(--gold)_22%,var(--card))]',
}

/**
 * A lesson screen (Practice, Puzzles, a game's review), the way Duolingo lays one out: exactly
 * the window's height, never scrolling. The prompt on top, the board taking whatever room is
 * left (`LessonBoard`), and the bar along the bottom (`LessonBar`).
 */
export function LessonScreen({ children }: { children: React.ReactNode }) {
  // -my-6 / pt-6 undo and redo FocusShell's padding, so the bar can sit on the bottom edge.
  // Clipped below, so the verdict sliding up from under the edge doesn't flash a scrollbar.
  return <div className="mx-auto -my-6 flex h-svh w-full max-w-xl flex-col gap-4 overflow-y-clip pt-6">{children}</div>
}

/** The board in a lesson: as big as the space between the prompt and the bar allows. */
export function LessonBoard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative min-h-48 flex-1 [container-type:size]', className)}>
      <div className="mx-auto size-[min(100cqw,100cqh)]">{children}</div>
    </div>
  )
}

/**
 * The bar along the bottom of a lesson, as in the design: before you answer, the controls and
 * a line of help; after, the verdict on a band across the whole window (green, red, or gold for
 * a great move) that slides up, with Continue.
 */
export function LessonBar({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <footer
      aria-live={tone === 'idle' || tone === 'retry' ? undefined : 'polite'}
      className={cn(
        'relative left-1/2 w-screen shrink-0 -translate-x-1/2 border-t-2 pb-[env(safe-area-inset-bottom)]',
        BAND[tone],
        tone !== 'idle' && tone !== 'retry' && 'animate-sheet',
      )}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:gap-6 md:px-6 md:py-5">
        {children}
      </div>
    </footer>
  )
}

// The right and gold marks bring their own round shape (KnIcon's check, a move badge).
const MARK: Record<Exclude<Tone, 'idle' | 'retry'>, string> = {
  right: 'animate-bounce-in',
  wrong: 'animate-shake bg-danger text-on-danger shadow-[inset_0_-3px_0_var(--move-shade)] [&_svg]:size-6',
  gold: '',
}
const TITLE: Record<Exclude<Tone, 'idle' | 'retry'>, string> = {
  right: 'text-brand-text',
  wrong: 'text-danger-text',
  gold: 'text-gold-text',
}

/** A verdict inside the bar: the round mark, the title, a line or two of why, then the
 * buttons (full width on a phone, on the right from md up). */
export function LessonVerdict({
  tone,
  icon,
  title,
  children,
  actions,
}: {
  tone: Exclude<Tone, 'idle' | 'retry'>
  icon: React.ReactNode
  title: React.ReactNode
  children?: React.ReactNode
  actions: React.ReactNode
}) {
  return (
    <>
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <span
          className={cn(
            'grid size-12 shrink-0 place-items-center rounded-full [animation-delay:calc(var(--duration-sheet)*0.6)]',
            MARK[tone],
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className={cn('text-[22px] leading-tight font-semibold', TITLE[tone])}>{title}</h2>
          {children && <div className="mt-0.5 text-[15px]">{children}</div>}
        </div>
      </div>
      <div className="flex shrink-0 gap-2 *:flex-1 md:*:flex-none">{actions}</div>
    </>
  )
}
