import { Chess } from 'chess.js'
import { CheckIcon, CircleNotchIcon, ListIcon, XIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { LoadingBlock } from '@/components/empty-state'
import { MoveBadge } from '@/components/move-badge'
import { MarkedText, MoveText } from '@/components/move-text'
import { LinePanel, ReviewBoard } from '@/components/review-bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { type DeckAnswer, type GameDetail, type LineKind, send, useApi } from '@/lib/api'
import { CLASSIFICATION } from '@/lib/classification'
import { nextTime, shortDate } from '@/lib/format'
import { type LessonStep, type StepMark, keyMoments, lessonSteps, moveLabel } from '@/lib/key-moments'
import { lastLocation } from '@/lib/last-location'
import { durationMs } from '@/lib/motion'
import { BOARDS, usePreferences } from '@/lib/preferences'
import { type Replay, type Side, useEngineLines, useLineView, useReplay } from '@/lib/replay'
import { playSound } from '@/lib/sound'
import { cn } from '@/lib/utils'
import { PlayBoard } from '@/pages/play'

/**
 * A game's review, as a lesson: one step per key moment, the way Practice and Puzzles work.
 * Where you went wrong and one move was clearly better, you find it on the board (your answer
 * is that review-deck position's answer for the day); where no single move fixes it, the step
 * shows what happened; a great move gets a gold sheet. All moves (the whole game) is one tap
 * away, and the last step finishes the review.
 */
export function ReviewPage() {
  const { id } = useParams()
  const { data: game, error } = useApi<GameDetail>(`/api/games/${id}`)
  const replay = useReplay(game)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const me: Side = game?.color ?? 'white'
  const opponent = (me === 'white' ? game?.black : game?.white) ?? 'They'
  const steps = useMemo(
    () => (game && replay ? lessonSteps(keyMoments(replay.moves, me, opponent), game.deck_plies) : []),
    [game, replay, me, opponent],
  )
  const index = Math.max(0, Math.min(steps.length - 1, Number(params.get('step') ?? 1) - 1))
  // Progress through the lesson, kept in this browser so a reload picks up where you were.
  const [marks, setMarks] = useState<Record<number, StepMark>>(() => loadProgress(id)?.marks ?? {})
  useEffect(() => {
    if (!params.has('step') && (loadProgress(id)?.step ?? 1) > 1) setParams({ step: String(loadProgress(id)!.step) }, { replace: true })
  }, [id, params, setParams])
  useEffect(() => {
    if (steps.length) saveProgress(id, { step: index + 1, marks })
  }, [id, index, marks, steps.length])
  const [finishing, setFinishing] = useState(false)

  if (error) return <p className="text-sm text-destructive">Couldn't load this game. {error}</p>
  if (!game || !replay) return <LoadingBlock label="Setting up the lesson…" className="mx-auto aspect-square w-full max-w-xl rounded-xl" />
  // Not analysed yet: nothing to teach, but the moves can still be stepped through.
  if (!replay.moves.length) return <Navigate to={`/games/${game.id}/moves`} replace />

  const finish = async () => {
    setFinishing(true)
    try {
      const results = steps.map((s) => ({ ply: s.ply, mark: marks[s.ply] ?? (s.type === 'praise' ? 'praise' : 'seen') }))
      await send('POST', `/api/games/${game.id}/review`, { marks: results })
      saveProgress(id, null)
      navigate(`/games/${game.id}/done`, { state: { celebrate: true } })
    } catch {
      setFinishing(false)
    }
  }

  if (!steps.length) return <QuietGame game={game} opponent={opponent} finishing={finishing} onFinish={finish} />

  const step = steps[index]
  const last = index === steps.length - 1
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      {/* Keyed by move, so the board, answer and sheet reset for each step. */}
      <Step
        key={step.ply}
        game={game}
        replay={replay}
        step={step}
        index={index}
        total={steps.length}
        me={me}
        opponent={opponent}
        last={last}
        finishing={finishing}
        onMark={(mark) => setMarks((m) => (m[step.ply] ? m : { ...m, [step.ply]: mark }))}
        onNext={last ? finish : () => setParams({ step: String(index + 2) }, { replace: true })}
      />
    </div>
  )
}

const SKIP = '0000'

interface Progress {
  step: number
  marks: Record<number, StepMark>
}
const progressKey = (id: string | undefined) => `knightly.lesson.${id}`

function loadProgress(id: string | undefined): Progress | null {
  try {
    return JSON.parse(localStorage.getItem(progressKey(id)) ?? 'null')
  } catch {
    return null // storage blocked or corrupt: start at the beginning
  }
}

function saveProgress(id: string | undefined, progress: Progress | null) {
  try {
    if (progress) localStorage.setItem(progressKey(id), JSON.stringify(progress))
    else localStorage.removeItem(progressKey(id))
  } catch {
    // storage blocked: the lesson still works, it just won't resume
  }
}

function Step({
  game,
  replay,
  step,
  index,
  total,
  me,
  opponent,
  last,
  finishing,
  onMark,
  onNext,
}: {
  game: GameDetail
  replay: Replay
  step: LessonStep
  index: number
  total: number
  me: Side
  opponent: string
  last: boolean
  finishing: boolean
  onMark: (mark: StepMark) => void
  onNext: () => void
}) {
  const { prefs } = usePreferences()
  const ply = step.ply
  const move = replay.moves[ply - 1]
  const before = useMemo(() => new Chess(replay.fens[ply - 1]), [replay, ply])
  const [selected, setSelected] = useState<string | null>(null)
  const [tried, setTried] = useState<string | null>(null) // your answer, as UCI
  const [result, setResult] = useState<DeckAnswer | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [line, setLine] = useState<{ kind: LineKind; step: number } | null>(null)
  const { view: lineView, error: lineError } = useLineView(game.id, ply, line)
  const lineLength = lineView?.squares.length ?? 0
  const lineStep = line ? Math.min(Math.max(line.step, 1), Math.max(lineLength, 1)) : 0

  const find = step.type === 'find'
  const answered = !find || !!result
  // The engine's one-line explanation of the best line, once there's something to explain.
  const lines = useEngineLines(game.id, answered && step.type !== 'praise' ? ply : null)
  const why = lines?.data ? (lines.data.best?.summary ?? null) : lines?.error ? null : undefined

  // The verdict's sound lands with the square's flash, after the piece.
  useEffect(() => {
    if (result) return playSound(result.correct ? 'right' : 'wrong', durationMs('--duration-move'))
  }, [result])

  const submit = (uci: string) => {
    setTried(uci)
    setSelected(null)
    send<DeckAnswer>('POST', '/api/deck/answer', { game_id: game.id, ply, uci })
      .then((r) => {
        setResult(r)
        onMark(r.correct ? 'found' : 'missed')
      })
      .catch((e: Error) => {
        setTried(null)
        setFailed(`Couldn't check that move. ${e.message}`)
      })
  }
  const tryMove = (from: string, to: string) => {
    if (tried) return false
    const probe = new Chess(before.fen())
    try {
      const m = probe.move({ from, to, promotion: 'q' })
      submit(m.from + m.to + (m.promotion ?? ''))
      return true
    } catch {
      return false
    }
  }
  const skipped = tried === SKIP

  // A found move is shown played; a miss shows the engine's move as an arrow.
  const shown = useMemo(() => {
    if (!result?.correct || !tried) return before
    const after = new Chess(before.fen())
    after.move({ from: tried.slice(0, 2), to: tried.slice(2, 4), promotion: tried[4] })
    return after
  }, [result, tried, before])

  const san = move.san
  const pctBefore = Math.round(move.win_pct_before ?? 50)
  const pctAfter = Math.round(move.win_pct_after ?? 50)
  const slipped = step.kind === 'miss' || step.short.startsWith('Missed')
  const prompt =
    step.type === 'praise'
      ? step.headline
      : step.type === 'look'
        ? `You played ${san} here.`
        : slipped
          ? `${opponent} just slipped. Find the move that punishes it.`
          : `You played ${san} here. Find a better move.`
  const sub =
    step.type === 'praise'
      ? step.headline.includes('%') ? '' : `Your chance: ${pctAfter}%.`
      : step.type === 'look'
        ? step.headline
        : slipped
          ? `You played ${san}, and your chance fell from ${pctBefore}% to ${pctAfter}%.`
          : `${san} took your chance from ${pctBefore}% to ${pctAfter}%.${step.short.includes('they missed it') ? ` ${opponent} missed it.` : ''}`
  const kind = CLASSIFICATION[step.kind]
  const done = index + (answered ? 1 : 0)
  const label = moveLabel(ply, san)

  return (
    <>
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Stop reviewing">
          <Link to={lastLocation('games-list', '/games')}>
            <XIcon />
          </Link>
        </Button>
        <Progress className="flex-1" label="Key moments" hideLabel value={(done / total) * 100} />
        <span key={done} className="animate-bump text-sm font-extrabold tabular-nums">
          {done} of {total}
        </span>
        <Button asChild variant="outline" size="sm" className="ml-1">
          <Link to={`/games/${game.id}/moves?ply=${ply}`} aria-label="All moves">
            <ListIcon />
            <span className="hidden sm:inline">All moves</span>
          </Link>
        </Button>
      </header>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            vs {opponent} · {shortDate(game.played_at)} · move {Math.ceil(ply / 2)}
          </Badge>
          <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: kind.color }}>
            <MoveBadge kind={step.kind} />
            {kind.label}
          </span>
        </div>
        <h1 className="text-3xl font-bold text-balance">{prompt}</h1>
        {sub && <p className="text-muted-foreground">{sub}</p>}
      </div>

      {/* As big as fits: the full width, or the window's height minus the prompt and answer. */}
      <div className="mx-auto flex w-full max-w-[calc(100svh-300px)] min-w-64 flex-col gap-2">
        {line && (
          <p className="flex items-center gap-2 rounded-lg bg-sky/15 px-3 py-2 text-sm font-extrabold">
            <span className="size-2.5 rounded-full bg-sky" /> Engine line, not the game.
            {lineView && ` Move ${lineStep} of ${lineLength}.`}
          </p>
        )}
        {line ? (
          <ReviewBoard
            fen={lineView ? lineView.fens[lineStep] : replay.fens[ply - 1]}
            orientation={me}
            lastMove={lineView?.squares[lineStep - 1]}
            nextMove={lineView?.squares[lineStep]}
            showBest={false}
            palette={BOARDS[prefs.board]}
            inLine
          />
        ) : find ? (
          <PlayBoard
            chess={shown}
            orientation={me}
            lastMove={result?.correct && tried ? { from: tried.slice(0, 2), to: tried.slice(2, 4) } : replay.squares[ply - 2]}
            hint={result && !result.correct ? result.best_uci : null}
            selected={selected}
            interactive={!tried}
            palette={BOARDS[prefs.board]}
            flash={result && tried && !skipped ? { square: tried.slice(2, 4), tone: result.correct ? 'right' : 'wrong' } : undefined}
            onMove={tryMove}
            onSelect={setSelected}
          />
        ) : (
          <ReviewBoard
            fen={replay.fens[ply]}
            orientation={me}
            lastMove={replay.squares[ply - 1]}
            move={move}
            showBest={step.type === 'look'}
            palette={BOARDS[prefs.board]}
          />
        )}
      </div>

      {failed && <p className="text-sm text-destructive">{failed}</p>}
      {line ? (
        <div className="panel overflow-hidden">
          <LinePanel
            kind={line.kind}
            view={lineView}
            error={lineError}
            step={lineStep}
            onStep={(s) => setLine((l) => (l ? { ...l, step: Math.max(1, Math.min(lineLength, s)) } : l))}
            ply={ply}
            san={san}
            classification={move.classification}
            yourBefore={pctBefore}
            yourEnd={lineView?.data.win_pct != null ? Math.round(lineView.data.win_pct) : null}
            onBack={() => setLine(null)}
            backLabel="Back to the lesson"
            onSwitch={() => setLine({ kind: line.kind === 'why' ? 'best' : 'why', step: 1 })}
          />
        </div>
      ) : !answered ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 pt-4">
          <Button variant="outline" onClick={() => submit(SKIP)} disabled={!!tried}>
            Show me
          </Button>
          <p className="text-sm text-muted-foreground">
            {tried ? 'Checking…' : selected ? 'Now pick where it goes.' : 'Tap a piece, then where it goes. Or drag it.'}
          </p>
        </div>
      ) : (
        <Sheet
          tone={step.type === 'praise' ? 'gold' : result?.correct ? 'right' : 'wrong'}
          icon={
            step.type === 'praise' ? (
              <MoveBadge kind={step.kind} pop className="size-10 text-lg [&_svg]:size-6" />
            ) : result?.correct ? (
              <CheckIcon className="size-6" />
            ) : (
              <XIcon className="size-6" />
            )
          }
          title={
            step.type === 'praise' ? (
              step.kind === 'best' ? (
                <>You punished it: <MoveText ply={ply} san={san} number /></>
              ) : (
                <>{kind.label} move: <MoveText ply={ply} san={san} number /></>
              )
            ) : result?.correct ? (
              `Found it: ${result.best_san}`
            ) : (
              `The move was ${result?.best_san ?? move.best_san}`
            )
          }
          onLine={step.type === 'praise' ? undefined : () => setLine({ kind: result?.correct ? 'best' : 'why', step: 1 })}
          next={last ? 'Finish review' : 'Continue'}
          busy={finishing}
          onNext={onNext}
        >
          <p>
            {step.type === 'praise' ? (
              PRAISE[step.kind] ?? step.headline
            ) : why === undefined ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <CircleNotchIcon className="size-4 animate-spin" /> Asking Stockfish why…
              </span>
            ) : (
              <MarkedText text={why ?? `${label} gave it away; the engine's move keeps the position.`} />
            )}
          </p>
          {step.type !== 'praise' && (
            <p className="mt-1 text-sm text-muted-foreground">
              {step.type === 'look'
                ? "It wasn't the only good move, so this one stays out of your review deck."
                : `In your review deck. ${result ? nextTime(result) : ''}`}
            </p>
          )}
        </Sheet>
      )}
    </>
  )
}

const PRAISE: Partial<Record<LessonStep['kind'], string>> = {
  brilliant: 'A sound sacrifice: it gives up material and the engine agrees.',
  great: 'The only move that held. Anything else lost a lot.',
  best: "They blundered, and you took what they gave: the engine's top choice.",
}

/** The sheet that slides up under the board: green found, red missed, gold for a great move. */
function Sheet({
  tone,
  icon,
  title,
  children,
  onLine,
  next,
  busy,
  onNext,
}: {
  tone: 'right' | 'wrong' | 'gold'
  icon: React.ReactNode
  title: React.ReactNode
  children: React.ReactNode
  onLine?: () => void
  next: string
  busy: boolean
  onNext: () => void
}) {
  return (
    <section
      aria-live="polite"
      className={cn(
        'panel flex animate-sheet flex-col gap-3 p-5',
        tone === 'right' ? 'border-brand bg-brand/15' : tone === 'wrong' ? 'border-danger bg-danger/15' : 'border-gold bg-gold/20',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-full [animation-delay:calc(var(--duration-sheet)*0.6)]',
            tone === 'right' && 'animate-bounce-in bg-brand text-on-brand',
            tone === 'wrong' && 'animate-shake bg-danger text-on-danger',
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h2
            className={cn(
              'text-2xl font-semibold',
              tone === 'right' ? 'text-brand-text' : tone === 'wrong' ? 'text-danger-text' : 'text-gold-text',
            )}
          >
            {title}
          </h2>
          <div className="mt-1">{children}</div>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {onLine && (
          <Button size="lg" variant="outline" onClick={onLine}>
            Show the line
          </Button>
        )}
        <Button size="lg" variant={tone === 'right' ? 'default' : tone === 'wrong' ? 'danger' : 'gold'} onClick={onNext} disabled={busy}>
          {busy && <CircleNotchIcon className="animate-spin" />}
          {next}
        </Button>
      </div>
    </section>
  )
}

/** A game with no key moments: no big swings either way. Nothing to drill, so straight to done. */
function QuietGame({ game, opponent, finishing, onFinish }: { game: GameDetail; opponent: string; finishing: boolean; onFinish: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Stop reviewing">
          <Link to={lastLocation('games-list', '/games')}>
            <XIcon />
          </Link>
        </Button>
        <span className="flex-1" />
        <Button asChild variant="outline" size="sm">
          <Link to={`/games/${game.id}/moves`}>
            <ListIcon /> All moves
          </Link>
        </Button>
      </header>
      <h1 className="text-3xl font-bold text-balance">A quiet game vs {opponent}</h1>
      <p className="text-muted-foreground">
        No key moments: no big swings either way, and nothing to drill. Look through All moves if you like, or finish the
        review.
      </p>
      <Button size="lg" className="self-start" onClick={onFinish} disabled={finishing}>
        {finishing && <CircleNotchIcon className="animate-spin" />}
        Finish review
      </Button>
    </div>
  )
}
