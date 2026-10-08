import { CircleNotchIcon, ListIcon, XIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { LoadingBlock } from '@/components/empty-state'
import { FindBar } from '@/components/find-bar'
import { MoveBadge } from '@/components/move-badge'
import { MarkedText, MoveText } from '@/components/move-text'
import { LessonBar, LessonBoard, LessonScreen, LessonVerdict } from '@/components/lesson-bar'
import { LinePanel, ReviewBoard } from '@/components/review-bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { type GameDetail, type LineKind, send, useApi } from '@/lib/api'
import { CLASSIFICATION } from '@/lib/classification'
import { nextTime, shortDate } from '@/lib/format'
import { type LessonStep, type StepMark, keyMoments, lessonSteps, moveLabel } from '@/lib/key-moments'
import { lastLocation } from '@/lib/last-location'
import { tacticHint } from '@/lib/patterns'
import { type FindOutcome, useFindMove } from '@/lib/find-move'
import { BOARDS, usePreferences } from '@/lib/preferences'
import { type Replay, type Side, useEngineLines, useLineView, useReplay } from '@/lib/replay'
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
    <LessonScreen>
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
    </LessonScreen>
  )
}

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
  const [line, setLine] = useState<{ kind: LineKind; step: number } | null>(null)
  const { view: lineView, error: lineError } = useLineView(game.id, ply, line)
  const lineLength = lineView?.squares.length ?? 0
  const lineStep = line ? Math.min(Math.max(line.step, 1), Math.max(lineLength, 1)) : 0
  const setLineStep = useCallback(
    (s: number) => setLine((l) => (l ? { ...l, step: Math.max(1, Math.min(lineLength, s)) } : l)),
    [lineLength],
  )
  // While a line is open the arrow keys step through it, as in All moves; Escape goes back.
  useEffect(() => {
    if (!line) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') setLine(null)
      const to = { ArrowLeft: lineStep - 1, ArrowRight: lineStep + 1, Home: 1, End: lineLength }[e.key]
      if (to !== undefined) setLineStep(to)
      if (to !== undefined || e.key === 'Escape') e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [line, lineStep, lineLength, setLineStep])

  const find = step.type === 'find'
  // Find steps work like Practice: try again after a miss, Hint, Show me; the first try is
  // that position's graded answer for the day (deck.py).
  const fm = useFindMove({
    gameId: game.id,
    ply,
    fen: replay.fens[ply - 1],
    tactic: tacticHint(move.pattern, step.kind === 'miss' || step.short.startsWith('Missed') ? 'chance' : 'threat'),
  })
  const answered = !find || !!fm.outcome
  useEffect(() => {
    if (find && fm.outcome) onMark(FIND_MARK[fm.outcome])
  }, [find, fm.outcome, onMark])
  // The engine's one-line explanation of the best line, once there's something to explain.
  const lines = useEngineLines(game.id, answered && step.type !== 'praise' ? ply : null)
  const why = lines?.data ? (lines.data.best?.summary ?? null) : lines?.error ? null : undefined

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

      {line && (
          <p className="flex items-center gap-2 rounded-lg bg-sky/15 px-3 py-2 text-sm font-extrabold">
            <span className="size-2.5 rounded-full bg-sky" /> Engine line, not the game.
            {lineView && ` Move ${lineStep} of ${lineLength}.`}
          </p>
      )}
      <LessonBoard>
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
            chess={fm.shown}
            orientation={me}
            lastMove={fm.board.lastMove ?? replay.squares[ply - 2]}
            hint={fm.board.hint}
            glow={fm.board.glow}
            selected={fm.selected}
            interactive={fm.board.interactive}
            palette={BOARDS[prefs.board]}
            flash={fm.board.flash}
            onMove={fm.tryMove}
            onSelect={fm.setSelected}
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
      </LessonBoard>

      {line ? (
        <div className="panel overflow-hidden">
          <LinePanel
            kind={line.kind}
            view={lineView}
            error={lineError}
            step={lineStep}
            onStep={setLineStep}
            ply={ply}
            san={san}
            classification={move.classification}
            yourBefore={pctBefore}
            yourEnd={lineView?.data.win_pct != null ? Math.round(lineView.data.win_pct) : null}
            onBack={() => setLine(null)}
            backLabel="Back to the lesson"
            onSwitch={() => setLine({ kind: line.kind === 'why' ? 'best' : 'why', step: 1 })}
            stepButtons
          />
        </div>
      ) : find ? (
        <FindBar
          find={fm}
          when={fm.first ? `In your review deck. ${nextTime(fm.first)}` : undefined}
          next={last ? 'Finish review' : 'Continue'}
          busy={finishing}
          onNext={onNext}
          onLine={() => setLine({ kind: fm.outcome === 'shown' ? 'why' : 'best', step: 1 })}
        >
          <p>
            {why === undefined ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <CircleNotchIcon className="size-4 animate-spin" /> Asking Stockfish why…
              </span>
            ) : (
              <MarkedText text={why ?? `${label} gave it away; the engine's move keeps the position.`} />
            )}
          </p>
        </FindBar>
      ) : (
        <Sheet
          tone={step.type === 'praise' ? 'gold' : 'wrong'}
          icon={
            step.type === 'praise' ? (
              <MoveBadge kind={step.kind} pop className="size-12 text-xl [&_svg]:size-7" />
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
            ) : (
              `The move was ${move.best_san}`
            )
          }
          onLine={step.type === 'praise' ? undefined : () => setLine({ kind: 'why', step: 1 })}
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
              It wasn't the only good move, so this one stays out of your review deck.
            </p>
          )}
        </Sheet>
      )}
    </>
  )
}

// How a find step went, as its mark on Review complete.
const FIND_MARK: Record<FindOutcome, StepMark> = { found: 'found', good: 'good', helped: 'helped', shown: 'missed' }

const PRAISE: Partial<Record<LessonStep['kind'], string>> = {
  brilliant: 'A sound sacrifice: it gives up material and the engine agrees.',
  great: 'The only move that held. Anything else lost a lot.',
  best: "They blundered, and you took what they gave: the engine's top choice.",
}

/** The verdict along the bottom: green found, red missed, gold for a great move. */
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
    <LessonBar tone={tone}>
      <LessonVerdict
        tone={tone}
        icon={icon}
        title={title}
        actions={
          <>
            {onLine && (
              <Button size="lg" variant="outline" onClick={onLine}>
                Show the line
              </Button>
            )}
            <Button size="lg" variant={tone === 'right' ? 'default' : tone === 'wrong' ? 'danger' : 'gold'} onClick={onNext} disabled={busy}>
              {busy && <CircleNotchIcon className="animate-spin" />}
              {next}
            </Button>
          </>
        }
      >
        {children}
      </LessonVerdict>
    </LessonBar>
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
