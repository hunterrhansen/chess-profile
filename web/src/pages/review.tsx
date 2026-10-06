import { Chess } from 'chess.js'
import { ArrowLeft, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, ExternalLink, LoaderCircle, Play, Plus, Trash2, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { type Arrow, Chessboard } from 'react-chessboard'
import { Link, useParams, useSearchParams } from 'react-router'
import { ResultBadge } from '@/components/game-bits'
import { MoveBadge } from '@/components/move-badge'
import { MarkedText, MoveText } from '@/components/move-text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { type Classification, type EngineLine, type EngineLines, type GameDetail, type LineKind, type MoveRow, type Note, send, useApi } from '@/lib/api'
import { CLASSIFICATION, isSound } from '@/lib/classification'
import { clock, longDate, shortDate, thinkTime, timeControl } from '@/lib/format'
import { lastLocation } from '@/lib/last-location'
import { BOARDS, usePreferences } from '@/lib/preferences'
import { cn } from '@/lib/utils'

const BEST_ARROW = 'rgba(99, 153, 34, 0.85)'
// Engine lines are drawn in blue so they never look like the real game's yellow.
const LINE_ARROW = 'rgba(70, 130, 220, 0.75)'
const LINE_LIGHT = '#B7D2EE'
const LINE_DARK = '#86A9CF'
const TIME_BAR_FULL = 100 // seconds of thinking that fill a time bar
const BLUNDER_DROP = 20 // keep in step with analyze.THRESHOLDS

type Side = 'white' | 'black'

/** Everything derived from the game once: positions, last-move squares, win%s, clocks. */
function useReplay(game: GameDetail | null) {
  return useMemo(() => {
    if (!game) return null
    const chess = new Chess(game.start_fen ?? undefined)
    const fens = [chess.fen()]
    const squares: { from: string; to: string }[] = []
    for (const san of game.san) {
      try {
        const m = chess.move(san)
        fens.push(chess.fen())
        squares.push({ from: m.from, to: m.to })
      } catch {
        break // stop at anything chess.js can't play rather than show a wrong position
      }
    }
    const moves = game.plies.length === squares.length ? game.plies : []
    // White's win% after each ply (index 0 = start position).
    const whiteWin = [moves[0]?.win_pct_before ?? 50]
    for (const m of moves) {
      const wa = m.win_pct_after ?? 50
      whiteWin.push(m.color === 'white' ? wa : 100 - wa)
    }
    const [base] = (game.time_control ?? '').split('+').map(Number)
    return { fens, squares, moves, whiteWin, baseClock: Number.isFinite(base) && base > 0 ? base : null }
  }, [game])
}

/** "Why" / "Best line" for one move, fetched the first time it's asked for, then kept. */
function useEngineLines(gameId: string | undefined, ply: number | null) {
  const [cache, setCache] = useState<Record<number, { data?: EngineLines; error?: string }>>({})
  const entry = ply == null ? undefined : cache[ply]
  useEffect(() => {
    if (ply == null || entry) return
    const ctrl = new AbortController()
    fetch(`/api/games/${gameId}/lines/${ply}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.detail ?? res.status)
        setCache((c) => ({ ...c, [ply]: { data: body } }))
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setCache((c) => ({ ...c, [ply]: { error: e.message } }))
      })
    return () => ctrl.abort()
  }, [gameId, ply, entry])
  return entry ?? null
}

export function ReviewPage() {
  const { id } = useParams()
  const { data: game, error } = useApi<GameDetail>(`/api/games/${id}`)
  const replay = useReplay(game)
  const notes = useApi<Note[]>(`/api/games/${id}/notes`)
  const notedPlies = useMemo(() => new Set(notes.data?.flatMap((n) => n.plies)), [notes.data])
  const [params, setParams] = useSearchParams()
  const last = replay ? replay.fens.length - 1 : 0
  const ply = Math.min(Number(params.get('ply') ?? 0), last)
  const tab = params.get('tab') === 'moments' ? 'moments' : 'moves'
  const { prefs } = usePreferences()
  // With the "on request" preference, the best move stays hidden until asked for, per move.
  const [revealedPly, setRevealedPly] = useState<number | null>(null)
  const showBest = prefs.bestArrow === 'auto' || revealedPly === ply
  // An engine line shown on the board in place of the game; leaving the move closes it.
  const [line, setLine] = useState<{ kind: LineKind; step: number } | null>(null)
  const lineEntry = useEngineLines(id, line ? ply : null)
  const lineView = useMemo(() => {
    const data = line && lineEntry?.data?.[line.kind]
    if (!data) return null
    const chess = new Chess(data.start_fen)
    const fens = [chess.fen()]
    const squares: { from: string; to: string }[] = []
    for (const uci of data.moves) {
      const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
      fens.push(chess.fen())
      squares.push({ from: m.from, to: m.to })
    }
    return { data, fens, squares, firstPly: data.kind === 'best' ? ply : ply + 1 }
  }, [line, lineEntry, ply])
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
  if (!game || !replay) return <ReviewSkeleton />

  const me: Side = game.color ?? 'white'
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

  return (
    <div className="flex flex-col gap-3">
      {/* Title row: which game this is, so the analysis sidebar can start with the move. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Link
          to={lastLocation('games-list', '/games')}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Games
        </Link>
        <span className="flex min-w-0 items-center gap-2">
          <ResultBadge outcome={game.outcome} />
          <span className="font-medium">
            vs {me === 'white' ? game.black : game.white}{' '}
            <span className="font-normal text-muted-foreground">{me === 'white' ? game.black_elo : game.white_elo}</span>
          </span>
          <span className="truncate text-muted-foreground">
            {[resultPhrase(game.outcome, game.ended_by), longDate(game.played_at), timeControl(game.time_control)]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        {game.url && (
          <a
            href={game.url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            Chess.com <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="mx-auto flex w-full max-w-[calc(100svh-170px)] min-w-72 flex-col gap-1.5">
          <PlayerStrip
            name={me === 'white' ? game.black : game.white}
            rating={me === 'white' ? game.black_elo : game.white_elo}
            seconds={clockAt(replay.moves, them, ply, replay.baseClock)}
            dim={inLine}
            tag={inLine ? 'Engine line · not played' : undefined}
          />
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
            {lineView ? (
              <Board
                fen={lineView.fens[step]}
                orientation={me}
                lastMove={lineView.squares[step - 1]}
                nextMove={lineView.squares[step]}
                showBest={false}
                palette={BOARDS[prefs.board]}
                inLine
              />
            ) : (
              <Board
                fen={replay.fens[ply]}
                orientation={me}
                lastMove={replay.squares[ply - 1]}
                move={move}
                showBest={showBest}
                palette={BOARDS[prefs.board]}
              />
            )}
          </div>
          <PlayerStrip
            name={me === 'white' ? game.white : game.black}
            rating={me === 'white' ? game.white_elo : game.black_elo}
            seconds={clockAt(replay.moves, me, ply, replay.baseClock)}
            dim={inLine}
            you
          />
        </div>

        <div className="relative min-h-[28rem]">
          <aside className="flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:absolute lg:inset-0">
            {prefs.showGraph && replay.moves.length > 0 && (
              <WinGraph replay={replay} me={me} ply={ply} onSelect={setPly} />
            )}
            {line && move && san ? (
              <LinePanel
                kind={line.kind}
                view={lineView}
                error={lineEntry?.error ?? null}
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
            ) : (
            <MovePanel
              ply={ply}
              san={san}
              move={move}
              analysed={replay.moves.length > 0}
              mine={mine}
              opponent={me === 'white' ? game.black : game.white}
              clockBefore={ply ? clockAt(replay.moves, ply % 2 === 1 ? 'white' : 'black', ply - 1, replay.baseClock) : null}
              clockAfter={ply ? clockAt(replay.moves, ply % 2 === 1 ? 'white' : 'black', ply, replay.baseClock) : null}
              showBest={showBest}
              onReveal={() => setRevealedPly(ply)}
              onShow={(kind) => setLine({ kind, step: 1 })}
            />
            )}
            {!line && notes.data && (
              <PositionNotes
                key={ply}
                gameId={game.id}
                ply={ply}
                fen={replay.fens[ply]}
                notes={notes.data.filter((n) => n.plies.includes(ply) || (ply === 0 && !n.plies.length))}
                onChange={notes.reload}
              />
            )}
            <Tabs
              value={tab}
              onValueChange={(v) =>
                setParams(
                  (prev) => {
                    const next = new URLSearchParams(prev)
                    if (v === 'moments') next.set('tab', v)
                    else next.delete('tab')
                    return next
                  },
                  { replace: true },
                )
              }
              className="border-b px-3 pt-2 pb-2"
            >
              <TabsList className="w-full">
                <TabsTrigger value="moves">Moves</TabsTrigger>
                <TabsTrigger value="moments" disabled={!replay.moves.length}>
                  Key moments
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className={cn('flex min-h-0 flex-1 flex-col transition-opacity', inLine && 'opacity-40')}>
              {tab === 'moves' ? (
                <MoveList san={game.san} moves={replay.moves} ply={ply} noted={notedPlies} onSelect={setPly} />
              ) : (
                <KeyMoments game={game} moves={replay.moves} whiteWin={replay.whiteWin} me={me} ply={ply} onSelect={setPly} />
              )}
            </div>
            {/* While a line is open these step through the line instead of the game. */}
            <div className="grid grid-cols-4 gap-2 border-t p-2">
              <NavButton label="First move" onClick={() => (line ? setStep(1) : setPly(0))} icon={<ChevronFirst />} />
              <NavButton
                label="Previous move"
                onClick={() => (line ? setStep(step - 1) : setPly(Math.max(0, ply - 1)))}
                icon={<ChevronLeft />}
              />
              <NavButton
                label="Next move"
                onClick={() => (line ? setStep(step + 1) : setPly(Math.min(last, ply + 1)))}
                icon={<ChevronRight />}
              />
              <NavButton label="Last move" onClick={() => (line ? setStep(lineLength) : setPly(last))} icon={<ChevronLast />} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

/** "Lost on time", "Won by checkmate", "Draw by repetition" from the outcome and ending. */
function resultPhrase(outcome: GameDetail['outcome'], endedBy: string | null) {
  if (!outcome) return null
  if (outcome === 'draw') {
    const how: Record<string, string> = {
      'Time vs material': 'timeout vs insufficient material',
      Material: 'insufficient material',
    }
    return endedBy ? `Draw by ${how[endedBy] ?? endedBy.toLowerCase()}` : 'Draw'
  }
  const verb = outcome === 'win' ? 'Won' : 'Lost'
  const how: Record<string, string> = {
    Checkmate: 'by checkmate',
    Resigned: 'by resignation',
    Time: 'on time',
    Abandoned: 'by abandonment',
  }
  return endedBy ? `${verb} ${how[endedBy] ?? `· ${endedBy}`}` : verb
}

/** Seconds left on `side`'s clock after `ply` half-moves, from the last clock it recorded. */
function clockAt(moves: MoveRow[], side: Side, ply: number, base: number | null) {
  let left = base
  for (const m of moves.slice(0, ply)) if (m.color === side && m.clock_left != null) left = m.clock_left
  return left
}

function PlayerStrip({
  name,
  rating,
  seconds,
  you,
  dim,
  tag,
}: {
  name: string
  rating: number | null
  seconds: number | null
  you?: boolean
  dim?: boolean
  tag?: string
}) {
  return (
    <div className="flex h-9 items-center gap-2 pl-6 text-sm">
      <span className="font-medium">{name}</span>
      <span className="text-muted-foreground">
        {rating}
        {you && ' · you'}
      </span>
      {tag && (
        <span className="ml-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-300">
          {tag}
        </span>
      )}
      {seconds != null && (
        <ClockChip seconds={seconds} className={cn('ml-auto text-base transition-opacity', dim && 'opacity-40')} />
      )}
    </div>
  )
}

function EvalBar({
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
  const whiteAhead = whiteWin >= 50
  // White's share sits at the bottom when you're White, at the top when you're Black.
  const whiteAtBottom = orientation === 'white'
  return (
    <div
      className={cn(
        'relative w-4 shrink-0 overflow-hidden rounded-sm bg-[#2b2b2b] ring-1 ring-foreground/10',
        'flex',
        whiteAtBottom ? 'flex-col-reverse' : 'flex-col',
      )}
      aria-label={`White's winning chance ${Math.round(whiteWin)}%`}
    >
      <div className="bg-[#f2f2f2] transition-[height] duration-200" style={{ height: `${whiteWin}%` }} />
      {score && (
        <span
          className={cn(
            'absolute inset-x-0 text-center text-[9px] font-medium',
            whiteAhead === whiteAtBottom ? 'bottom-1' : 'top-1',
            whiteAhead ? 'text-[#2b2b2b]' : 'text-[#f2f2f2]',
          )}
        >
          {score}
        </span>
      )}
    </div>
  )
}

function isLightSquare(square: string) {
  return (square.charCodeAt(0) - 97 + Number(square[1])) % 2 === 0
}

function Board({
  fen,
  orientation,
  lastMove,
  move,
  nextMove,
  showBest,
  palette,
  inLine,
}: {
  fen: string
  orientation: Side
  lastMove?: { from: string; to: string }
  move?: MoveRow
  nextMove?: { from: string; to: string }
  showBest: boolean
  palette: (typeof BOARDS)[keyof typeof BOARDS]
  inLine?: boolean
}) {
  const squareStyles = lastMove
    ? Object.fromEntries(
        [lastMove.from, lastMove.to].map((sq) => [
          sq,
          {
            backgroundColor: isLightSquare(sq)
              ? inLine ? LINE_LIGHT : palette.lightHl
              : inLine ? LINE_DARK : palette.darkHl,
          },
        ]),
      )
    : {}
  // In the game: the engine's better move in green. In a line: the line's next move in blue.
  const arrows: Arrow[] = inLine
    ? nextMove ? [{ startSquare: nextMove.from, endSquare: nextMove.to, color: LINE_ARROW }] : []
    : showBest && move && !isSound(move.classification) && move.best_uci
      ? [{ startSquare: move.best_uci.slice(0, 2), endSquare: move.best_uci.slice(2, 4), color: BEST_ARROW }]
      : []
  const badge = move?.classification && lastMove ? { square: lastMove.to, kind: move.classification } : null

  return (
    <div
      className={cn(
        'min-w-0 flex-1 overflow-visible rounded-sm',
        inLine && 'outline-3 outline-offset-2 outline-blue-500',
      )}
    >
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          allowDragging: false,
          animationDurationInMs: 150,
          lightSquareStyle: { backgroundColor: palette.light },
          darkSquareStyle: { backgroundColor: palette.dark },
          lightSquareNotationStyle: { color: palette.dark },
          darkSquareNotationStyle: { color: palette.light },
          arrows,
          // A custom renderer replaces the library's own square wrapper, which is where it
          // applies `squareStyles`, so the last-move highlight is applied here instead.
          squareRenderer: ({ square, children }) => (
            <div className="relative size-full" style={squareStyles[square]}>
              {children}
              {badge?.square === square && (
                <MoveBadge
                  kind={badge.kind}
                  className="pointer-events-none absolute -top-2 -right-2 z-10 size-[38%] max-h-7 max-w-7 text-[clamp(9px,1.4vw,12px)] shadow-[0_0_0_1.5px_rgba(0,0,0,0.25)] [&_svg]:size-[60%]"
                />
              )}
            </div>
          ),
        }}
      />
    </div>
  )
}

function WinGraph({
  replay,
  me,
  ply,
  onSelect,
}: {
  replay: NonNullable<ReturnType<typeof useReplay>>
  me: Side
  ply: number
  onSelect: (ply: number) => void
}) {
  const W = 300
  const H = 64
  const n = replay.whiteWin.length - 1
  const mine = replay.whiteWin.map((w) => (me === 'white' ? w : 100 - w))
  const x = (p: number) => (p / Math.max(1, n)) * W
  const y = (w: number) => H - 2 - (w / 100) * (H - 4)
  const line = mine.map((w, p) => `${x(p).toFixed(1)},${y(w).toFixed(1)}`).join(' ')
  const errors = replay.moves.filter(
    (m) => m.color === me && (m.classification === 'mistake' || m.classification === 'blunder' || m.classification === 'miss'),
  )

  return (
    <div className="border-b px-3 py-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full cursor-pointer"
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
        <polygon points={`0,${H} ${line} ${W},${H}`} className="fill-muted" />
        <line x1={0} x2={W} y1={y(50)} y2={y(50)} className="stroke-border" strokeDasharray="3 3" />
        <polyline points={line} fill="none" className="stroke-foreground" strokeWidth={1.5} />
        {errors.map((m) => (
          <circle key={m.ply} cx={x(m.ply)} cy={y(mine[m.ply])} r={3.2} fill={CLASSIFICATION[m.classification!].color} />
        ))}
        <line x1={x(ply)} x2={x(ply)} y1={0} y2={H} className="stroke-foreground" strokeWidth={1} />
      </svg>
    </div>
  )
}

/** The same clock chip as the player strips; red under a minute. */
function ClockChip({ seconds, className }: { seconds: number; className?: string }) {
  return (
    <span
      className={cn(
        'rounded-md bg-muted px-2.5 py-0.5 font-mono tabular-nums',
        seconds < 60 && 'bg-loss/15 text-loss',
        className,
      )}
    >
      {clock(seconds)}
    </span>
  )
}

/**
 * Color for a change in YOUR win chance, whoever moved: what it means for you, not how good
 * the move was (the badge says that). +10 or more green, -10 or more red, -5 to -10 amber.
 */
function changeTone(change: number) {
  if (change >= 10) return { text: 'text-win', chip: 'bg-win/15 text-win' }
  if (change <= -10) return { text: 'text-loss', chip: 'bg-loss/15 text-loss' }
  if (change <= -5) return { text: 'text-amber-600 dark:text-amber-400', chip: 'text-amber-600 dark:text-amber-400' }
  return { text: '', chip: 'text-muted-foreground' }
}

/**
 * The selected move: your win chance before and after it (from your side even on the
 * opponent's moves, like the graph), then the mover's clock before and after with the
 * thinking time.
 */
function MovePanel({
  ply,
  san,
  move,
  analysed,
  mine,
  opponent,
  clockBefore,
  clockAfter,
  showBest,
  onReveal,
  onShow,
}: {
  ply: number
  san?: string
  move?: MoveRow
  analysed: boolean
  mine: boolean
  opponent: string
  clockBefore: number | null
  clockAfter: number | null
  showBest: boolean
  onReveal: () => void
  onShow: (kind: LineKind) => void
}) {
  if (!ply || !san) {
    return (
      <div className="min-h-24 border-b px-3 py-2.5 text-sm">
        <p className="font-medium">Starting position</p>
        <p className="text-muted-foreground">Step forward, or pick a move or key moment.</p>
      </div>
    )
  }
  const kind = move?.classification
  // Stored win%s are the mover's; flip the opponent's moves to your side.
  const yours = (v: number | null) => Math.round(mine ? (v ?? 50) : 100 - (v ?? 50))
  const before = yours(move?.win_pct_before ?? null)
  const after = yours(move?.win_pct_after ?? null)
  const change = after - before
  const tone = changeTone(change)
  return (
    <div className="min-h-24 border-b px-3 py-2.5 text-sm">
      <div className="flex items-center gap-2 text-base font-medium">
        <MoveText ply={ply} san={san} number />
        <span className="text-sm font-normal text-muted-foreground">{mine ? 'You' : opponent}</span>
        {kind && (
          <span className="ml-auto flex items-center gap-1.5 text-sm font-normal">
            <MoveBadge kind={kind} />
            {CLASSIFICATION[kind].label}
          </span>
        )}
      </div>
      {!analysed || !move ? (
        <p className="mt-1 text-muted-foreground">Not analysed yet. Run `chessprofile analyze`.</p>
      ) : (
        <>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-0.5 rounded-lg bg-muted px-2.5 py-2">
              <span className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                Chance
                <span className={cn('rounded px-1 font-medium tabular-nums', tone.chip)}>
                  {change > 0 ? '+' : change < 0 ? '−' : '±'}
                  {Math.abs(change)}%
                </span>
              </span>
              <span className="whitespace-nowrap tabular-nums">
                <span className="text-base font-medium">{before}</span>
                <span className="text-muted-foreground"> → </span>
                <span className={cn('text-base font-medium', tone.text)}>{after}%</span>
              </span>
            </div>
            {clockBefore != null && clockAfter != null && (
              <div className="flex flex-col gap-0.5 rounded-lg bg-muted px-2.5 py-2">
                <span className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  {mine ? 'Your clock' : 'Their clock'}
                  {move.time_spent != null && <span className="tabular-nums">{thinkTime(move.time_spent)}</span>}
                </span>
                <span className="whitespace-nowrap font-mono text-[15px] tabular-nums">
                  <span className={cn(clockBefore < 60 && 'text-loss')}>{clock(clockBefore)}</span>
                  <span className="text-muted-foreground"> → </span>
                  <span className={cn(clockAfter < 60 && 'text-loss')}>{clock(clockAfter)}</span>
                </span>
              </div>
            )}
          </div>
          <div className="mt-2.5 text-muted-foreground">
            {!isSound(kind ?? null) && move.best_san ? (
              <span className="flex items-center gap-2">
                Best
                {showBest ? (
                  <span className="rounded-md bg-win/15 px-2 py-0.5 font-medium text-win">
                    <MoveText ply={ply} san={move.best_san} />
                  </span>
                ) : (
                  <button
                    onClick={onReveal}
                    className="rounded-md border border-dashed px-2 py-0.5 text-foreground hover:bg-muted"
                  >
                    Show best move
                  </button>
                )}
                <span className="ml-auto flex gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 px-2.5 text-foreground" onClick={() => onShow('why')}>
                    <Play className="size-3 fill-current" /> Why
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 px-2.5 text-foreground" onClick={() => onShow('best')}>
                    <Play className="size-3 fill-current" /> Best line
                  </Button>
                </span>
              </span>
            ) : kind === 'best' ? (
              "The engine's top choice"
            ) : kind === 'excellent' ? (
              'Nearly as good as the best move'
            ) : (
              'A solid move'
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** An engine line in place of the move panel: title, the moves as steps, why it matters. */
function LinePanel({
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
  onSwitch,
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
  onSwitch: () => void
}) {
  const label = classification ? CLASSIFICATION[classification].label.toLowerCase() : 'move'
  const article = /^[aeiou]/.test(label) ? 'an' : 'a'
  return (
    <div className="border-b bg-blue-500/10 px-3 py-2.5 text-sm">
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
          <LoaderCircle className="size-4 animate-spin" /> Asking Stockfish…
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
                        ? 'bg-blue-500/20 font-semibold text-blue-700 dark:text-blue-300'
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
      <div className="mt-2.5 flex gap-2">
        <Button size="sm" onClick={onBack}>
          <Undo2 /> Back to game
        </Button>
        <Button size="sm" variant="outline" onClick={onSwitch}>
          {kind === 'why' ? 'Show best line' : 'Show why'}
        </Button>
      </div>
    </div>
  )
}

/**
 * Notes on the position on the board (after the selected move): ones written here, and ones
 * from other games that reached the same position. On the starting position, also the notes
 * on the game as a whole.
 */
function PositionNotes({
  gameId,
  ply,
  fen,
  notes,
  onChange,
}: {
  gameId: number
  ply: number
  fen: string
  notes: Note[]
  onChange: () => void
}) {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await send('POST', '/api/notes', {
        body,
        tags: tags.split(/[\s,]+/).filter(Boolean),
        game_id: gameId,
        ply,
        fen,
      })
      setBody('')
      setTags('')
      setOpen(false)
      onChange()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (note: Note) => {
    if (!window.confirm('Delete this note?')) return
    try {
      await send('DELETE', `/api/notes/${note.id}`)
      onChange()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="border-b px-3 py-2 text-sm">
      {notes.length > 0 && (
        <ul className="mb-2 flex max-h-36 flex-col gap-1.5 overflow-y-auto">
          {notes.map((n) => {
            const elsewhere = n.game && n.game.id !== gameId
            return (
              <li key={n.id} className="group flex gap-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="leading-snug whitespace-pre-wrap">{n.body}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
                    {n.tags.map((t) => (
                      <span key={t}>#{t}</span>
                    ))}
                    {!n.plies.length && <span>On the whole game</span>}
                    {elsewhere && (
                      <Link
                        to={`/games/${n.game!.id}${n.game!.ply ? `?ply=${n.game!.ply}` : ''}`}
                        className="underline-offset-2 hover:text-foreground hover:underline"
                      >
                        Same position vs {n.game!.opponent ?? 'another game'}
                        {n.game!.played_at && `, ${shortDate(n.game!.played_at)}`}
                      </Link>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => remove(n)}
                  className="h-fit shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                  aria-label="Delete note"
                  title="Delete note"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {open ? (
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <textarea
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
              if (e.key === 'Escape') setOpen(false)
            }}
            rows={3}
            placeholder="What did you learn here?"
            className="w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, e.g. tactics fork" />
          {error && <p className="text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={busy || !body.trim()}>
              Save note
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          {error && <p className="mb-1 text-destructive">{error}</p>}
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-3.5" /> Note on this position
          </button>
        </>
      )}
    </div>
  )
}

function MoveList({
  san,
  moves,
  ply,
  noted,
  onSelect,
}: {
  san: string[]
  moves: MoveRow[]
  ply: number
  noted: Set<number>
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
          {[i, i + 1].map((j) =>
            j < san.length ? (
              <button
                key={j}
                data-selected={j + 1 === ply}
                onClick={() => onSelect(j + 1)}
                className={cn(
                  'flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-left hover:bg-foreground/10',
                  j + 1 === ply && 'bg-foreground/15 font-medium',
                )}
              >
                <MoveText ply={j + 1} san={san[j]} />
                {noted.has(j + 1) && <span className="size-1.5 rounded-full bg-amber-500" aria-label="has a note" />}
              </button>
            ) : (
              <span key={j} />
            ),
          )}
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

type Moment = { ply: number; badge?: Classification; tag?: string; text: React.ReactNode; detail: string }

function KeyMoments({
  game,
  moves,
  whiteWin,
  me,
  ply,
  onSelect,
}: {
  game: GameDetail
  moves: MoveRow[]
  whiteWin: number[]
  me: Side
  ply: number
  onSelect: (ply: number) => void
}) {
  const moments = useMemo(() => {
    const out: Moment[] = []
    const pct = (v: number | null) => Math.round(v ?? 0)
    const swing = (m: MoveRow) => `${pct(m.win_pct_before)} → ${pct(m.win_pct_after)}%`
    // Your replies already described by a "Punished" / "Missed" row, so they aren't listed twice.
    const replies = new Set<number>()
    moves.forEach((m, i) => {
      const reply = moves[i + 1]
      if (m.color !== me && reply && (m.win_pct_before ?? 0) - (m.win_pct_after ?? 0) >= BLUNDER_DROP) {
        const punished = isSound(reply.classification)
        replies.add(reply.ply)
        out.push({
          ply: reply.ply,
          badge: punished ? 'best' : (reply.classification ?? 'miss'),
          text: (
            <>
              {punished ? 'Punished' : 'Missed'} <MoveText ply={m.ply} san={m.san} number />
            </>
          ),
          detail: swing(reply),
        })
      }
    })
    for (const m of moves) {
      const c = m.classification
      if (m.color === me && !replies.has(m.ply) && (c === 'mistake' || c === 'blunder' || c === 'miss')) {
        out.push({ ply: m.ply, badge: c, text: <MoveText ply={m.ply} san={m.san} number />, detail: swing(m) })
      }
    }
    // Your best moment: the highest win chance right after one of your own moves.
    const mine = whiteWin.map((w) => (me === 'white' ? w : 100 - w))
    let peak = 0
    for (const m of moves) if (m.color === me && (!peak || mine[m.ply] > mine[peak])) peak = m.ply
    if (peak) {
      out.push({
        ply: peak,
        tag: 'Peak',
        text: <MoveText ply={peak} san={moves[peak - 1].san} number />,
        detail: `${Math.round(mine[peak])}%`,
      })
    }
    const end = game.outcome === 'win' ? 'Won' : game.outcome === 'loss' ? 'Lost' : 'Drew'
    out.push({ ply: moves.length, tag: 'End', text: `${end} · ${game.ended_by ?? ''}`, detail: '' })
    return out.sort((a, b) => a.ply - b.ply)
  }, [game, moves, whiteWin, me])

  return (
    <div className="min-h-40 flex-1 overflow-y-auto">
      {moments.map((k, i) => (
        <button
          key={i}
          onClick={() => onSelect(k.ply)}
          className={cn(
            'flex w-full items-center gap-2.5 border-b px-3 py-2 text-left text-sm hover:bg-muted/60',
            k.ply === ply && 'bg-muted',
          )}
        >
          {k.badge ? (
            <MoveBadge kind={k.badge} />
          ) : (
            <span className="w-5 shrink-0 text-center text-[10px] text-muted-foreground">{k.tag}</span>
          )}
          <span className="min-w-0 truncate">{k.text}</span>
          <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">{k.detail}</span>
        </button>
      ))}
    </div>
  )
}

function NavButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <Button variant="secondary" className="h-10 [&_svg]:size-5" aria-label={label} title={label} onClick={onClick}>
      {icon}
    </Button>
  )
}

function ReviewSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Skeleton className="mx-auto aspect-square w-full max-w-[calc(100svh-170px)]" />
      <Skeleton className="h-[28rem] rounded-xl" />
    </div>
  )
}
