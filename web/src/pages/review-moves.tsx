import { ArrowLeftIcon, ArrowSquareOutIcon, CaretLeftIcon, CaretLineLeftIcon, CaretLineRightIcon, CaretRightIcon, PlayIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { ResultBadge } from '@/components/game-bits'
import { LoadingBlock } from '@/components/empty-state'
import { MoveBadge } from '@/components/move-badge'
import { MoveText } from '@/components/move-text'
import { EvalBar, LinePanel, MoveList, NavButton, PlayerStrip, ReviewBoard } from '@/components/review-bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { type GameDetail, type LineKind, type MoveRow, useApi } from '@/lib/api'
import { CLASSIFICATION, isSound, moveLook } from '@/lib/classification'
import { type KeyMoment, keyMoments } from '@/lib/key-moments'
import { changeTone, longDate, shortDate, thinkTime, timeControl } from '@/lib/format'
import { lastLocation } from '@/lib/last-location'
import { useWide } from '@/lib/motion'
import { BOARDS, usePreferences } from '@/lib/preferences'
import { type Replay, type Side, clockAt, resultPhrase, useLineView, useReplay } from '@/lib/replay'
import { cn } from '@/lib/utils'

/**
 * All moves: the whole game, to browse outside the lesson. The board with the eval bar and
 * clocks, your winning chance over the game with the lesson's key moments on it, the move
 * you're on, and the move list. Why / Best line play out on the board in blue.
 */
export function AllMovesPage() {
  const { id } = useParams()
  const { data: game, error } = useApi<GameDetail>(`/api/games/${id}`)
  const replay = useReplay(game)
  const [params, setParams] = useSearchParams()
  const last = replay ? replay.fens.length - 1 : 0
  const ply = Math.min(Number(params.get('ply') ?? 0), last)
  const me: Side = game?.color ?? 'white'
  const opponent = (me === 'white' ? game?.black : game?.white) ?? 'They'
  const moments = useMemo(() => (replay ? keyMoments(replay.moves, me, opponent) : []), [replay, me, opponent])
  const { prefs } = usePreferences()
  // A tablet held upright gets the phone layout too: the desktop one would stack the moves under the board.
  const wide = useWide('lg')
  // With the "on request" preference, the best move stays hidden until asked for, per move.
  const [revealedPly, setRevealedPly] = useState<number | null>(null)
  const showBest = prefs.bestArrow === 'auto' || revealedPly === ply
  // An engine line shown on the board in place of the game; leaving the move closes it.
  const [line, setLine] = useState<{ kind: LineKind; step: number } | null>(null)
  const { view: lineView, error: lineError } = useLineView(id, ply, line)
  const lineLength = lineView?.squares.length ?? 0
  const step = line ? Math.min(Math.max(line.step, 1), Math.max(lineLength, 1)) : 0
  const setStep = useCallback(
    (s: number) => setLine((l) => (l ? { ...l, step: Math.max(1, Math.min(lineLength, s)) } : l)),
    [lineLength],
  )

  const setPly = useCallback(
    (p: number) => {
      setLine(null)
      return setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (p > 0) next.set('ply', String(p))
          else next.delete('ply')
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return
      if (line) {
        // While a line is open the keys step through it; Escape goes back to the game.
        if (e.key === 'Escape') setLine(null)
        const to = { ArrowLeft: step - 1, ArrowRight: step + 1, Home: 1, End: lineLength }[e.key]
        if (to !== undefined) setStep(to)
        if (to !== undefined || e.key === 'Escape') e.preventDefault()
        return
      }
      const to = { ArrowLeft: ply - 1, ArrowRight: ply + 1, Home: 0, End: last }[e.key]
      if (to === undefined) return
      e.preventDefault()
      setPly(Math.max(0, Math.min(last, to)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ply, last, setPly, line, step, lineLength, setStep])

  if (error) return <p className="text-sm text-destructive">Couldn't load this game. {error}</p>
  if (!game || !replay) return <MovesSkeleton />

  const them: Side = me === 'white' ? 'black' : 'white'
  const move = replay.moves[ply - 1] as MoveRow | undefined
  const san = game.san[ply - 1]
  const mine = ply > 0 && (ply % 2 === 1) === (me === 'white')
  const moverWhite = ply % 2 === 1
  // Your win chance (not the mover's): before the move, and at the end of the open line.
  const yours = (moverPct: number | null | undefined) =>
    moverPct == null ? null : Math.round(mine ? moverPct : 100 - moverPct)
  const inLine = !!lineView
  const lineWhiteWin =
    lineView?.data.win_pct != null ? (moverWhite ? lineView.data.win_pct : 100 - lineView.data.win_pct) : null
  const hasLesson = moments.length > 0
  const stepAt = moments.findIndex((k) => k.ply === ply)
  const wrong = !!move && !isSound(move.classification) && !!move.best_san
  const linePanel = line && move && san && (
    <LinePanel
      kind={line.kind}
      view={lineView}
      error={lineError}
      step={step}
      onStep={setStep}
      ply={ply}
      san={san}
      classification={move.classification}
      yourBefore={yours(move.win_pct_before)}
      yourEnd={yours(lineView?.data.win_pct)}
      onBack={() => setLine(null)}
      onSwitch={() => setLine({ kind: line.kind === 'why' ? 'best' : 'why', step: 1 })}
    />
  )
  const board = lineView ? (
    <ReviewBoard
      fen={lineView.fens[step]}
      orientation={me}
      lastMove={lineView.squares[step - 1]}
      nextMove={lineView.squares[step]}
      showBest={false}
      palette={BOARDS[prefs.board]}
      inLine
    />
  ) : (
    <ReviewBoard
      fen={replay.fens[ply]}
      orientation={me}
      lastMove={replay.squares[ply - 1]}
      move={move}
      showBest={showBest}
      palette={BOARDS[prefs.board]}
    />
  )
  const theirStrip = (inset: boolean) => (
    <PlayerStrip
      name={opponent}
      rating={me === 'white' ? game.black_elo : game.white_elo}
      seconds={clockAt(replay.moves, them, ply, replay.baseClock)}
      dim={inLine}
      tag={inLine ? 'Engine line · not played' : undefined}
      inset={inset}
    />
  )
  const yourStrip = (inset: boolean) => (
    <PlayerStrip
      name={me === 'white' ? game.white : game.black}
      rating={me === 'white' ? game.white_elo : game.black_elo}
      seconds={clockAt(replay.moves, me, ply, replay.baseClock)}
      dim={inLine}
      you
      inset={inset}
    />
  )

  // On a phone or tablet: the board on top, the move you're on, a strip of moves to scroll
  // sideways, and the step buttons with Show the line along the bottom, in reach of a thumb.
  // Exactly the window's height: the board takes what the rest leaves. (The negative margins
  // undo FocusShell's padding.)
  if (!wide) {
    return (
      <div className="-mx-4 -my-6 flex h-svh flex-col md:-mx-8">
        <header className="flex items-center gap-2 border-b-2 bg-card px-2 py-2">
          <Button asChild variant="ghost" size="icon" aria-label={hasLesson ? 'Back to the lesson' : 'Back to games'}>
            <Link to={hasLesson ? `/games/${game.id}` : lastLocation('games-list', '/games')}>
              <ArrowLeftIcon />
            </Link>
          </Button>
          <ResultBadge outcome={game.outcome} />
          <div className="min-w-0">
            <h1 className="text-lg leading-tight font-bold">vs {opponent}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {['All moves', shortDate(game.played_at), timeControl(game.time_control)].filter(Boolean).join(' · ')}
            </p>
          </div>
        </header>

        {/* 72px: the two player strips. */}
        <div className="min-h-48 flex-1 px-4 pt-1.5 [container-type:size]">
          <section aria-label="Board" className="mx-auto flex w-[min(100cqw,calc(100cqh-72px))] flex-col">
            {theirStrip(false)}
            <div className="flex">{board}</div>
            {yourStrip(false)}
          </section>
        </div>

        {linePanel ? (
          <div className="panel mx-4 mt-1 shrink-0 overflow-hidden">{linePanel}</div>
        ) : (
          <div className="px-4 pt-1">
            {ply && san ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-heading text-xl font-bold">
                    <MoveText ply={ply} san={san} number />
                  </span>
                  {move?.classification && (
                    <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: CLASSIFICATION[move.classification].color }}>
                      <MoveBadge kind={move.classification} />
                      {CLASSIFICATION[move.classification].label}
                    </span>
                  )}
                  {move && (
                    <span className={cn('ml-auto font-heading text-xl font-bold tabular-nums', changeTone(yours(move.win_pct_after)! - yours(move.win_pct_before)!).text)}>
                      {yours(move.win_pct_after)}%
                    </span>
                  )}
                </div>
                {move && (
                  <p className="text-sm text-muted-foreground">
                    {mine ? 'Your' : `${opponent}'s`} move: your chance went from {yours(move.win_pct_before)}% to {yours(move.win_pct_after)}%.
                    {wrong && (showBest ? ` ${mine ? 'Best was' : 'They had'} ${move.best_san}.` : '')}
                    {wrong && !showBest && (
                      <button onClick={() => setRevealedPly(ply)} className="ml-1 font-bold text-foreground underline underline-offset-2">
                        Show best move
                      </button>
                    )}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">The start. Step through with the arrows, or tap a move.</p>
            )}
          </div>
        )}

        <MoveStrip san={game.san} moves={replay.moves} ply={ply} me={me} dim={inLine} onSelect={setPly} />

        <footer className="mt-2 flex gap-2 border-t-2 bg-card px-4 pt-2.5 pb-[max(14px,env(safe-area-inset-bottom))]">
          <NavButton
            label="Previous move"
            onClick={() => (line ? setStep(step - 1) : setPly(Math.max(0, ply - 1)))}
            icon={<CaretLeftIcon />}
          />
          <NavButton
            label="Next move"
            onClick={() => (line ? setStep(step + 1) : setPly(Math.min(last, ply + 1)))}
            icon={<CaretRightIcon />}
          />
          {line ? (
            <Button className="flex-1" onClick={() => setLine(null)}>
              Back to the game
            </Button>
          ) : wrong ? (
            <Button variant="sky" className="flex-1" onClick={() => setLine({ kind: mine ? 'why' : 'best', step: 1 })}>
              Show the line
            </Button>
          ) : (
            <span className="flex-1" />
          )}
        </footer>
      </div>
    )
  }

  // From lg up the page is exactly the window's height, never scrolling: the board takes the
  // height the header leaves, and the move list whatever the graph and current move leave.
  // (-my-6 / py-6 undo and redo FocusShell's padding.)
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:-my-6 lg:h-svh lg:py-6">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3.5 gap-y-2">
        {hasLesson ? (
          <Button asChild variant="outline" size="sm">
            <Link to={`/games/${game.id}`}>
              <ArrowLeftIcon /> Back to the lesson
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link to={lastLocation('games-list', '/games')}>
              <ArrowLeftIcon /> Games
            </Link>
          </Button>
        )}
        <ResultBadge outcome={game.outcome} />
        <h1 className="text-2xl font-bold">
          vs {opponent}{' '}
          <span className="font-sans text-base font-semibold text-muted-foreground">
            {me === 'white' ? game.black_elo : game.white_elo}
          </span>
        </h1>
        <span className="text-sm text-muted-foreground">
          {[resultPhrase(game.outcome, game.ended_by), longDate(game.played_at), timeControl(game.time_control), `${Math.ceil(game.san.length / 2)} moves`]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {game.url && (
          <a
            href={game.url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex items-center gap-1 text-sm text-brand-text hover:underline"
          >
            Chess.com <ArrowSquareOutIcon className="size-3.5" />
          </a>
        )}
      </header>

      <div className="grid gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:[container-type:size]">
        {/* 110px: the two player strips, the step buttons and the gaps, less the eval bar beside the board. */}
        <section
          aria-label="Board"
          className="mx-auto flex w-full max-w-[calc(100svh-150px)] min-w-72 flex-col gap-1.5 lg:max-w-[calc(100cqh-110px)]"
        >
          {theirStrip(true)}
          <div className="flex gap-2">
            {lineView ? (
              <EvalBar
                whiteWin={lineWhiteWin ?? replay.whiteWin[ply]}
                label={lineView.data.mate != null ? `M${Math.abs(lineView.data.mate)}` : null}
                orientation={me}
              />
            ) : (
              <EvalBar whiteWin={replay.whiteWin[ply]} move={move} orientation={me} />
            )}
            {board}
          </div>
          {yourStrip(true)}
          {/* While a line is open these step through the line instead of the game. */}
          <div className="mt-1 grid grid-cols-4 gap-2 pl-6">
            <NavButton label="Start of the game" onClick={() => (line ? setStep(1) : setPly(0))} icon={<CaretLineLeftIcon />} />
            <NavButton
              label="Previous move"
              onClick={() => (line ? setStep(step - 1) : setPly(Math.max(0, ply - 1)))}
              icon={<CaretLeftIcon />}
            />
            <NavButton
              label="Next move"
              onClick={() => (line ? setStep(step + 1) : setPly(Math.min(last, ply + 1)))}
              icon={<CaretRightIcon />}
            />
            <NavButton label="End of the game" onClick={() => (line ? setStep(lineLength) : setPly(last))} icon={<CaretLineRightIcon />} />
          </div>
        </section>

        <aside aria-label="Moves" className="flex min-w-0 flex-col gap-3.5 lg:min-h-0">
          {replay.moves.length > 0 && (
            <WinGraph replay={replay} me={me} ply={ply} moments={moments} onSelect={setPly} />
          )}
          <div className="panel overflow-hidden">
            {linePanel ? (
              linePanel
            ) : (
              <CurrentMove
                gameId={game.id}
                ply={ply}
                san={san}
                move={move}
                analysed={replay.moves.length > 0}
                mine={mine}
                opponent={opponent}
                step={stepAt >= 0 ? stepAt + 1 : null}
                showBest={showBest}
                onReveal={() => setRevealedPly(ply)}
                onShow={(kind) => setLine({ kind, step: 1 })}
              />
            )}
          </div>
          <div className={cn('panel flex max-h-80 min-h-48 flex-col overflow-hidden transition-opacity lg:max-h-none lg:min-h-0 lg:flex-1', inLine && 'opacity-40')}>
            <MoveList san={game.san} moves={replay.moves} ply={ply} me={me} onSelect={setPly} />
          </div>
        </aside>
      </div>
    </div>
  )
}

/**
 * Your winning chance over the game (click to jump to a move), with the lesson's key moments
 * on the line as badges and a sky line where you are.
 */
export function WinGraph({
  replay,
  me,
  ply,
  moments,
  onSelect,
}: {
  replay: Replay
  me: Side
  ply: number
  moments: KeyMoment[]
  onSelect: (ply: number) => void
}) {
  const W = 400
  const H = 112
  const n = replay.whiteWin.length - 1
  const mine = replay.whiteWin.map((w) => (me === 'white' ? w : 100 - w))
  const x = (p: number) => (p / Math.max(1, n)) * W
  const y = (w: number) => H - 2 - (w / 100) * (H - 4)
  const line = mine.map((w, p) => `${x(p).toFixed(1)},${y(w).toFixed(1)}`).join(' ')

  return (
    <section aria-label="Your winning chance" className="panel flex flex-col gap-2.5 px-4 py-3.5">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">Your winning chance</span>
        <span className="font-heading text-2xl font-bold tabular-nums">{Math.round(mine[ply])}%</span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block h-28 w-full cursor-pointer overflow-visible rounded-lg bg-muted"
          role="slider"
          aria-label="Win chance from your side; click to jump to a move"
          aria-valuemin={0}
          aria-valuemax={n}
          aria-valuenow={ply}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            onSelect(Math.round(((e.clientX - r.left) / r.width) * n))
          }}
        >
          <line x1={0} x2={W} y1={y(50)} y2={y(50)} className="stroke-border" strokeWidth={2} strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
          <polygon points={`0,${H} ${line} ${W},${H}`} className="fill-brand/20" />
          <polyline points={line} fill="none" className="stroke-brand" strokeWidth={3} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <line x1={x(ply)} x2={x(ply)} y1={0} y2={H} className="stroke-sky" strokeWidth={3} vectorEffect="non-scaling-stroke" />
        </svg>
        {moments.map((k) => (
          <button
            key={k.ply}
            onClick={() => onSelect(k.ply)}
            aria-label={`Go to key moment ${k.short.toLowerCase()}`}
            title={k.short}
            className="absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
            style={{ left: `${(x(k.ply) / W) * 100}%`, top: `${(y(mine[k.ply]) / H) * 100}%` }}
          >
            <MoveBadge kind={k.kind} />
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Move 1</span>
        {moments.length > 0 && <span>Tap a badge to jump there</span>}
        <span>Move {Math.ceil(n / 2)}</span>
      </div>
    </section>
  )
}

/**
 * The move you're on: its badge, whether it's a step of the lesson, your chance before and
 * after it (from your side even on the opponent's moves, like the graph), and the better
 * move when it went wrong, with Why / Best line.
 */
function CurrentMove({
  gameId,
  ply,
  san,
  move,
  analysed,
  mine,
  opponent,
  step,
  showBest,
  onReveal,
  onShow,
}: {
  gameId: number
  ply: number
  san?: string
  move?: MoveRow
  analysed: boolean
  mine: boolean
  opponent: string
  step: number | null
  showBest: boolean
  onReveal: () => void
  onShow: (kind: LineKind) => void
}) {
  if (!ply || !san) {
    return (
      <div className="min-h-24 border-b px-4 py-3.5">
        <p className="font-heading text-xl font-bold">Start position</p>
        <p className="text-muted-foreground">Step through with the arrows, or tap any move.</p>
      </div>
    )
  }
  const kind = move?.classification
  // Stored win%s are the mover's; flip the opponent's moves to your side.
  const yours = (v: number | null) => Math.round(mine ? (v ?? 50) : 100 - (v ?? 50))
  const before = yours(move?.win_pct_before ?? null)
  const after = yours(move?.win_pct_after ?? null)
  const tone = changeTone(after - before)
  const wrong = !!move && !isSound(kind ?? null) && !!move.best_san
  return (
    <div className="flex min-h-24 flex-col gap-2.5 border-b px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-heading text-xl font-bold">
          <MoveText ply={ply} san={san} number />
        </span>
        {kind && (
          <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: CLASSIFICATION[kind].color }}>
            <MoveBadge kind={kind} />
            {CLASSIFICATION[kind].label}
          </span>
        )}
        {step && <Badge variant="sky">Lesson step {step}</Badge>}
      </div>
      {!analysed || !move ? (
        <p className="text-muted-foreground">Not analysed yet. Run `knightly analyze`.</p>
      ) : (
        <>
          <p>
            {mine ? 'Your move.' : `${opponent}'s move.`} Your chance went from{' '}
            <span className="font-bold tabular-nums">{before}%</span> to{' '}
            <span className={cn('font-bold tabular-nums', tone.text)}>{after}%</span>.
            {move.time_spent != null && (
              <span className="text-muted-foreground">
                {' '}
                {mine ? 'You' : 'They'} took {thinkTime(move.time_spent)}.
              </span>
            )}
          </p>
          {wrong && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">{mine ? 'Best was' : 'They had'}</span>
              {showBest ? (
                <span className="rounded-md bg-win/15 px-2 py-0.5 font-bold text-brand-text">
                  <MoveText ply={ply} san={move.best_san!} />
                </span>
              ) : (
                <button onClick={onReveal} className="rounded-md border-2 border-dashed px-2 py-0.5 text-sm hover:bg-muted">
                  Show best move
                </button>
              )}
            </div>
          )}
          {wrong && (
            <div className="flex flex-wrap gap-2">
              <Button variant="sky" size="sm" onClick={() => onShow('why')}>
                <PlayIcon weight="fill" /> Why
              </Button>
              <Button variant="sky" size="sm" onClick={() => onShow('best')}>
                <PlayIcon weight="fill" /> Best line
              </Button>
              {step && mine && (
                <Button asChild variant="outline" size="sm">
                  <Link to={`/games/${gameId}?step=${step}`}>Try it in the lesson</Link>
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** The phone's move list: every move in one row to scroll sideways, the current one kept in
 * view. Your bad moves in red with their badge, the opponent's greyed. */
function MoveStrip({
  san,
  moves,
  ply,
  me,
  dim,
  onSelect,
}: {
  san: string[]
  moves: MoveRow[]
  ply: number
  me: Side
  dim: boolean
  onSelect: (ply: number) => void
}) {
  const listRef = useRef<HTMLOListElement>(null)
  useLayoutEffect(() => {
    const list = listRef.current
    const sel = list?.querySelector<HTMLElement>('[aria-current="step"]')
    if (list) list.scrollLeft = sel ? sel.offsetLeft - list.clientWidth / 2 + sel.offsetWidth / 2 : 0
  }, [ply])
  return (
    <ol
      ref={listRef}
      aria-label="All moves"
      className={cn('relative mt-2.5 flex shrink-0 gap-1 overflow-x-auto px-4 pb-1 whitespace-nowrap tabular-nums transition-opacity', dim && 'opacity-40')}
    >
      {san.map((s, i) => {
        const p = i + 1
        const look = moveLook(p, moves[i] as MoveRow | undefined, me)
        return (
          <li key={p}>
            <button
              onClick={() => onSelect(p)}
              aria-current={p === ply ? 'step' : undefined}
              className={cn(
                'flex h-9 items-center gap-1 rounded-lg px-2 text-sm',
                look.className,
                p === ply && 'bg-sky/15 shadow-[inset_0_0_0_2px_var(--sky)]',
              )}
            >
              {p % 2 === 1 && <span className="text-muted-foreground">{Math.ceil(p / 2)}.</span>}
              <MoveText ply={p} san={s} />
              {look.badge && <MoveBadge kind={look.badge} />}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function MovesSkeleton() {
  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <LoadingBlock label="Setting up the board…" className="mx-auto aspect-square w-full max-w-[calc(100svh-150px)] rounded-sm" />
      <Skeleton className="h-[28rem] rounded-xl" />
    </div>
  )
}
