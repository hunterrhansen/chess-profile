import { ArrowUUpLeftIcon, CaretLeftIcon, CaretRightIcon, CircleNotchIcon } from '@phosphor-icons/react'
import { useLayoutEffect, useRef } from 'react'
import type { Square } from 'chess.js'
import { Board, type BoardArrow, type Palette } from '@/components/board'
import { EvalBar as EvalBarView } from '@/components/eval-bar'
import { MoveBadge } from '@/components/move-badge'
import { MarkedText, MoveText } from '@/components/move-text'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Classification, EngineLine, LineKind, MoveRow } from '@/lib/api'
import { CLASSIFICATION, isSound, moveLook } from '@/lib/classification'
import { clock, thinkTime } from '@/lib/format'
import type { Side } from '@/lib/replay'
import type { PositionPreview } from '@/lib/api'
import { fenPly } from '@/lib/variation-tree'
import type { Variation } from '@/lib/variation'
import { cn } from '@/lib/utils'

/* The pieces a game's review is built from, shared by the lesson (pages/review.tsx), All
   moves (pages/review-moves.tsx) and Play's finished game. */

const TIME_BAR_FULL = 100 // seconds of thinking that fill a time bar

/** A player above or below the board. `inset` lines the name up with the board past the
 * eval bar; leave it off where there's no eval bar. */
export function PlayerStrip({
  name,
  rating,
  seconds,
  you,
  dim,
  tag,
  inset = true,
}: {
  name: string
  rating: number | null
  seconds: number | null
  you?: boolean
  dim?: boolean
  tag?: string
  inset?: boolean
}) {
  return (
    <div className={cn('flex h-9 items-center gap-2 text-sm', inset && 'pl-6')}>
      <span className="font-medium">{name}</span>
      <span className="text-muted-foreground">
        {rating}
        {you && ' · you'}
      </span>
      {tag && (
        <Badge variant="sky" className="ml-1">
          {tag}
        </Badge>
      )}
      {seconds != null && (
        <ClockChip seconds={seconds} className={cn('ml-auto text-base transition-opacity', dim && 'opacity-40')} />
      )}
    </div>
  )
}

export function EvalBar({
  whiteWin,
  move,
  label,
  orientation,
}: {
  whiteWin: number
  move?: MoveRow
  label?: string | null
  orientation: Side
}) {
  const score =
    label !== undefined
      ? label
      : move?.mate_after != null
      ? `M${Math.abs(move.mate_after)}`
      : move?.eval_after != null
        ? (Math.abs(move.eval_after) / 100).toFixed(1)
        : null
  return <EvalBarView whiteWin={whiteWin} score={score} whiteAtBottom={orientation === 'white'} />
}

/** The game's board: the last move with its badge and, when asked, the engine's better move
 * in green. In a line, everything turns blue and the arrow is the line's next move. */
export function ReviewBoard({
  fen,
  orientation,
  lastMove,
  move,
  nextMove,
  showBest,
  palette,
  inLine,
  interaction,
  flash,
}: {
  fen: string
  orientation: Side
  lastMove?: { from: string; to: string }
  move?: MoveRow
  nextMove?: { from: string; to: string }
  showBest: boolean
  palette: Palette
  inLine?: boolean
  interaction?: Variation
  flash?: { square: string; tone: 'right' | 'wrong' }
}) {
  const arrows: BoardArrow[] = inLine
    ? nextMove ? [{ ...nextMove, tone: 'line' }] : []
    : showBest && move && !isSound(move.classification) && move.best_uci
      ? [{ from: move.best_uci.slice(0, 2), to: move.best_uci.slice(2, 4), tone: 'best' }]
      : []
  return (
    <Board
      fen={fen}
      orientation={orientation}
      palette={palette}
      lastMove={lastMove}
      inLine={inLine}
      arrows={arrows}
      badge={move?.classification && lastMove ? { square: lastMove.to, kind: move.classification } : null}
      flash={flash}
      selected={interaction?.selected}
      targets={new Set(interaction?.selected ? interaction.chess.moves({ square: interaction.selected as Square, verbose: true }).map((m) => m.to) : [])}
      movable={interaction && !interaction.result ? interaction.chess.turn() : undefined}
      onMove={interaction?.move}
      onSelect={interaction?.select}
    />
  )
}

/** The same compact notation and blue line state as review's existing engine panels. */
export function VariationPanel({ variation, preview, onPreview, controls = true }: {
  variation: Variation
  preview: { data?: PositionPreview; error?: string; retry: () => void }
  onPreview: (moves: string[]) => void
  controls?: boolean
}) {
  const { tree, path, cursor, exploring, chess } = variation
  const firstPly = fenPly(tree.nodes[0].fen) + 1
  const currentPly = fenPly(chess.fen()) + 1
  const data = preview.data
  const score = data?.mate != null ? `M${data.mate}` : data?.eval_cp != null
    ? `${data.eval_cp >= 0 ? '+' : ''}${(data.eval_cp / 100).toFixed(1)}` : null
  const children = tree.nodes[cursor].children
  return (
    <section aria-label="Position analysis" className="px-3 py-2.5 text-sm">
      {exploring && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant="sky">Variation · not played</Badge>
          {!variation.result && <span className="text-muted-foreground">{chess.turn() === 'w' ? 'White' : 'Black'} to move</span>}
        </div>
      )}
      {exploring && (
        <ol className="mb-2 flex flex-wrap gap-1" aria-label="Your variation">
          <li><Button size="sm" variant="ghost" onClick={() => variation.go(0)}>Start</Button></li>
          {path.map((node, i) => (
            <li key={node.id}>
              <Button size="sm" className="normal-case" variant={node.id === cursor ? 'sky' : 'ghost'} aria-current={node.id === cursor ? 'step' : undefined} onClick={() => variation.go(node.id)}>
                <MoveText ply={firstPly + i} san={node.san!} number />
              </Button>
            </li>
          ))}
        </ol>
      )}
      {children.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1" aria-label="Continuations">
          <span className="text-muted-foreground">Continue:</span>
          {children.map((id) => <Button key={id} size="sm" className="normal-case" variant="outline" onClick={() => variation.go(id)}><MoveText ply={currentPly} san={tree.nodes[id].san!} number /></Button>)}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold">Stockfish preview</span>
        {score && !variation.result && <span className="font-mono tabular-nums" aria-label={`Evaluation from White's perspective: ${score}`}><span className="text-xs text-muted-foreground">White </span>{score}</span>}
      </div>
      {variation.result ? <p className="mt-1 font-bold">{variation.result}</p>
        : preview.error ? <p className="mt-1 text-destructive">{preview.error} <Button size="sm" variant="ghost" onClick={preview.retry}>Retry</Button></p>
        : !data ? <p className="mt-1 flex items-center gap-2 text-muted-foreground" role="status"><CircleNotchIcon className="size-4 animate-spin" /> Asking Stockfish…</p>
        : <ol className="mt-2 flex flex-wrap gap-1" aria-label="Stockfish preview moves">
          {data.san.map((san, i) => <li key={i}><Button size="sm" className="normal-case" variant="ghost" onClick={() => onPreview(data.moves.slice(0, i + 1))}><MoveText ply={currentPly + i} san={san} number={i === 0 || (currentPly + i) % 2 === 1} /></Button></li>)}
        </ol>}
      {controls && exploring && (
        <div className="mt-2 flex flex-wrap gap-2">
          <NavButton label="Previous variation move" onClick={variation.previous} disabled={cursor === 0} icon={<CaretLeftIcon />} className="h-8 w-10 [&_svg]:size-4" />
          <NavButton label="Next variation move" onClick={variation.next} disabled={!children.length} icon={<CaretRightIcon />} className="h-8 w-10 [&_svg]:size-4" />
          <Button size="sm" onClick={variation.back}><ArrowUUpLeftIcon /> Back to game</Button>
        </div>
      )}
    </section>
  )
}

/** The same clock chip as the player strips; red under a minute. */
function ClockChip({ seconds, className }: { seconds: number; className?: string }) {
  return (
    <span
      className={cn(
        'rounded-md bg-muted px-2.5 py-0.5 font-mono tabular-nums',
        seconds < 60 && 'bg-loss/15 text-danger-text',
        className,
      )}
    >
      {clock(seconds)}
    </span>
  )
}

/** An engine line in place of the move panel: title, the moves as steps, why it matters.
 * `stepButtons` adds previous/next buttons, where nothing else around it steps the line. */
export function LinePanel({
  kind,
  view,
  error,
  step,
  onStep,
  ply,
  san,
  classification,
  yourBefore,
  yourEnd,
  onBack,
  backLabel = 'Back to game',
  onSwitch,
  stepButtons,
}: {
  kind: LineKind
  view: { data: EngineLine; firstPly: number; squares: unknown[] } | null
  error: string | null
  step: number
  onStep: (step: number) => void
  ply: number
  san: string
  classification: Classification | null
  yourBefore: number | null
  yourEnd: number | null
  onBack: () => void
  backLabel?: string
  onSwitch: () => void
  stepButtons?: boolean
}) {
  const label = classification ? CLASSIFICATION[classification].label.toLowerCase() : 'move'
  const article = /^[aeiou]/.test(label) ? 'an' : 'a'
  return (
    <div className="border-b bg-sky/10 px-3 py-2.5 text-sm">
      <div className="flex items-center gap-2 font-medium">
        {kind === 'why' ? (
          <span>
            Why <MoveText ply={ply} san={san} number /> is {article} {label}
          </span>
        ) : (
          <span>
            Best line{view && <>: <MoveText ply={ply} san={view.data.san[0]} number /></>}
          </span>
        )}
        {view && (
          <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
            {step} / {view.squares.length}
          </span>
        )}
      </div>

      {error ? (
        <p className="mt-2 text-destructive">Couldn't get the line. {error}</p>
      ) : !view ? (
        <p className="mt-2 flex items-center gap-2 text-muted-foreground">
          <CircleNotchIcon className="size-4 animate-spin" /> Asking Stockfish…
        </p>
      ) : (
        <>
          <ol className="mt-2 flex flex-wrap gap-1" aria-label="Engine line">
            {view.data.san.map((s, i) => {
              const linePly = view.firstPly + i
              return (
                <li key={i}>
                  <button
                    onClick={() => onStep(i + 1)}
                    aria-current={i + 1 === step ? 'step' : undefined}
                    className={cn(
                      'rounded-md px-2 py-0.5 tabular-nums',
                      i + 1 === step
                        ? 'bg-sky font-bold text-on-sky'
                        : 'bg-muted hover:bg-foreground/10',
                      i + 1 > step && 'opacity-60',
                    )}
                  >
                    <MoveText ply={linePly} san={s} number={linePly % 2 === 1 || i === 0} />
                  </button>
                </li>
              )
            })}
          </ol>
          {view.data.summary && (
            <p className="mt-2 leading-relaxed">
              <MarkedText text={view.data.summary} />
            </p>
          )}
          {yourBefore != null && yourEnd != null && (
            <p className="mt-1 text-muted-foreground">
              Your chance{' '}
              <span className="text-foreground tabular-nums">
                {yourBefore}% → {yourEnd}%
              </span>
            </p>
          )}
        </>
      )}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {stepButtons && view && (
          <>
            <NavButton
              label="Previous move"
              onClick={() => onStep(step - 1)}
              disabled={step <= 1}
              icon={<CaretLeftIcon />}
              className="h-8 w-10 [&_svg]:size-4"
            />
            <NavButton
              label="Next move"
              onClick={() => onStep(step + 1)}
              disabled={step >= view.squares.length}
              icon={<CaretRightIcon />}
              className="h-8 w-10 [&_svg]:size-4"
            />
          </>
        )}
        <Button size="sm" onClick={onBack}>
          <ArrowUUpLeftIcon /> {backLabel}
        </Button>
        <Button size="sm" variant="outline" onClick={onSwitch}>
          {kind === 'why' ? 'Show best line' : 'Show why'}
        </Button>
      </div>
    </div>
  )
}

/** The move list, two moves to a row with thinking-time bars. Pass `me` to mark the moves
 * as All moves does: badges, your bad moves in red, the opponent's greyed. */
export function MoveList({
  san,
  moves,
  ply,
  me,
  onSelect,
}: {
  san: string[]
  moves: MoveRow[]
  ply: number
  me?: Side
  onSelect: (ply: number) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  // Keep the selected move centred in the list without scrolling the page.
  useLayoutEffect(() => {
    const list = listRef.current
    const sel = list?.querySelector<HTMLElement>('[data-selected="true"]')
    if (!list) return
    list.scrollTop = sel ? sel.offsetTop - list.clientHeight / 2 + sel.offsetHeight / 2 : 0
  }, [ply])

  const rows = []
  for (let i = 0; i < san.length; i += 2) rows.push(i)

  return (
    <div ref={listRef} className="relative min-h-40 flex-1 overflow-y-auto">
      {rows.map((i) => (
        <div
          key={i}
          className="group grid h-8 grid-cols-[2.25rem_1fr_1fr_3rem] items-center px-3 text-sm even:bg-muted/40"
        >
          <span className="text-muted-foreground">{i / 2 + 1}.</span>
          {[i, i + 1].map((j) => {
            if (j >= san.length) return <span key={j} />
            const look = moveLook(j + 1, moves[j], me)
            return (
              <button
                key={j}
                data-selected={j + 1 === ply}
                onClick={() => onSelect(j + 1)}
                className={cn(
                  'flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-left hover:bg-foreground/10',
                  j + 1 === ply && 'bg-foreground/15 font-medium',
                  look.className,
                )}
              >
                <MoveText ply={j + 1} san={san[j]} />
                {look.badge && <MoveBadge kind={look.badge} />}
              </button>
            )
          })}
          <TimeCell white={moves[i]?.time_spent} black={moves[i + 1]?.time_spent} />
        </div>
      ))}
    </div>
  )
}

/** Thinking-time bars (White on top, Black below); hovering the row shows the seconds. */
function TimeCell({ white, black }: { white?: number | null; black?: number | null }) {
  if (white == null && black == null) return <span />
  const bar = (s: number | null | undefined, className: string) =>
    s == null ? (
      <span className="h-1.5" />
    ) : (
      <span
        className={cn('h-1.5 min-w-1 rounded-sm', className)}
        style={{ width: `${(Math.min(s, TIME_BAR_FULL) / TIME_BAR_FULL) * 100}%` }}
      />
    )
  return (
    <div className="flex h-7 flex-col items-end justify-center">
      <div className="flex w-full flex-col items-end gap-1 group-hover:hidden">
        {bar(white, 'bg-foreground/25')}
        {bar(black, 'bg-foreground/60')}
      </div>
      <div className="hidden flex-col items-end text-[11px] leading-3.5 text-muted-foreground tabular-nums group-hover:flex">
        <span>{white != null ? thinkTime(white) : ''}</span>
        <span>{black != null ? thinkTime(black) : ''}</span>
      </div>
    </div>
  )
}

export function NavButton({
  label,
  onClick,
  icon,
  disabled,
  className,
}: {
  label: string
  onClick: () => void
  icon: React.ReactNode
  disabled?: boolean
  className?: string
}) {
  return (
    <Button
      variant="secondary"
      className={cn('h-10 [&_svg]:size-5', className)}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
    </Button>
  )
}
