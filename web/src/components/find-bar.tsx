import { CheckIcon, CircleNotchIcon, LightbulbIcon, XIcon } from '@phosphor-icons/react'
import { LessonBar, LessonVerdict } from '@/components/lesson-bar'
import { Button } from '@/components/ui/button'
import type { FindMove } from '@/lib/find-move'

const PIECE: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

/**
 * The bottom bar while you find a move: Hint and Show me with a line of help (red after a
 * miss: "Not quite"), then the verdict. Found and a good move are green, found with help is
 * green too (you did find it), Show me is red. `children` is the why, `when` says when the
 * position comes back.
 */
export function FindBar({
  find,
  children,
  when,
  next = 'Continue',
  busy = false,
  onNext,
  onLine,
}: {
  find: FindMove
  children?: React.ReactNode
  when?: React.ReactNode
  next?: string
  busy?: boolean
  onNext: () => void
  onLine?: () => void
}) {
  const { outcome, first, playedSan } = find
  if (!outcome) {
    const notQuite = find.misses > 0 && !find.selected && !find.checking && find.hints === 0
    const help = find.checking
      ? 'Checking…'
      : find.selected
        ? 'Now pick where it goes.'
        : find.hints === 1 && find.hintPiece
          ? `Hint: move the ${PIECE[find.hintPiece.type]} on ${find.hintPiece.square}.`
          : find.hints >= 2
            ? 'The arrow shows the move. Play it.'
            : notQuite
              ? 'Not quite. Try again, or use a hint.'
              : 'Tap a piece, then where it goes. Or drag it.'
    return (
      <LessonBar tone={notQuite ? 'retry' : 'idle'}>
        <div className="flex shrink-0 gap-2">
          {find.hints < 2 && (
            <Button variant="outline" onClick={find.askHint} disabled={!find.hintReady || find.checking}>
              <LightbulbIcon weight="fill" className="text-gold" />
              {find.hints === 0 ? 'Hint' : 'Show the move'}
            </Button>
          )}
          <Button variant="ghost" onClick={find.showMe} disabled={find.checking}>
            Show me
          </Button>
        </div>
        <p className={notQuite ? 'text-sm font-extrabold text-danger-text' : find.hints ? 'text-sm font-extrabold text-gold-text' : 'text-sm text-muted-foreground'}>
          {find.error ?? help}
        </p>
      </LessonBar>
    )
  }

  const best = first?.best_san ?? ''
  const right = outcome !== 'shown'
  const title =
    outcome === 'found'
      ? `Found it: ${playedSan ?? best}`
      : outcome === 'good'
        ? `Good move! Best was ${best}`
        : outcome === 'helped'
          ? `Found it, with help: ${playedSan ?? best}`
          : `The move was ${best}`
  return (
    <LessonBar tone={right ? 'right' : 'wrong'}>
      <LessonVerdict
        tone={right ? 'right' : 'wrong'}
        icon={right ? <CheckIcon /> : <XIcon />}
        title={title}
        actions={
          <>
            {onLine && (
              <Button size="lg" variant="outline" onClick={onLine}>
                Show the line
              </Button>
            )}
            <Button size="lg" variant={right ? 'default' : 'danger'} onClick={onNext} disabled={busy}>
              {busy && <CircleNotchIcon className="animate-spin" />}
              {next}
            </Button>
          </>
        }
      >
        {outcome === 'found' && first?.quality === 'excellent' && playedSan !== best && (
          <p className="text-sm">The engine's first choice was {best}, by a hair.</p>
        )}
        {children}
        {when && <p className="mt-0.5 text-[13px] text-muted-foreground">{when}</p>}
      </LessonVerdict>
    </LessonBar>
  )
}
