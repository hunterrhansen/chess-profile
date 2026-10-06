import { Chess } from 'chess.js'
import { ArrowLeft, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { type Arrow, Chessboard } from 'react-chessboard'
import { Link, useParams, useSearchParams } from 'react-router'
import { ResultBadge } from '@/components/game-bits'
import { MoveBadge } from '@/components/move-badge'
import { MoveText } from '@/components/move-text'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { type Classification, type GameDetail, type MoveRow, useApi } from '@/lib/api'
import { CLASSIFICATION, isSound } from '@/lib/classification'
import { clock, longDate, thinkTime, timeControl } from '@/lib/format'
import { cn } from '@/lib/utils'

const LIGHT = '#EDD6B0'
const DARK = '#B88762'
const LIGHT_HL = '#F6EB72'
const DARK_HL = '#DDC34B'
const BEST_ARROW = 'rgba(99, 153, 34, 0.85)'
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

export function ReviewPage() {
  const { id } = useParams()
  const { data: game, error } = useApi<GameDetail>(`/api/games/${id}`)
  const replay = useReplay(game)
  const [params, setParams] = useSearchParams()
  const last = replay ? replay.fens.length - 1 : 0
  const ply = Math.min(Number(params.get('ply') ?? 0), last)
  const tab = params.get('tab') === 'moments' ? 'moments' : 'moves'

  const setPly = useCallback(
    (p: number) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (p > 0) next.set('ply', String(p))
          else next.delete('ply')
          return next
        },
        { replace: true },
      ),
    [setParams],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return
      const to = { ArrowLeft: ply - 1, ArrowRight: ply + 1, Home: 0, End: last }[e.key]
      if (to === undefined) return
      e.preventDefault()
      setPly(Math.max(0, Math.min(last, to)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ply, last, setPly])

  if (error) return <p className="text-sm text-destructive">Couldn't load this game. {error}</p>
  if (!game || !replay) return <ReviewSkeleton />

  const me: Side = game.color ?? 'white'
  const them: Side = me === 'white' ? 'black' : 'white'
  const move = replay.moves[ply - 1] as MoveRow | undefined
  const san = game.san[ply - 1]

  return (
    <div className="flex flex-col gap-3">
      <Link to="/games" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Games
      </Link>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="mx-auto flex w-full max-w-[calc(100svh-170px)] min-w-72 flex-col gap-1.5">
          <PlayerStrip
            name={me === 'white' ? game.black : game.white}
            rating={me === 'white' ? game.black_elo : game.white_elo}
            seconds={clockAt(replay.moves, them, ply, replay.baseClock)}
          />
          <div className="flex gap-2">
            <EvalBar whiteWin={replay.whiteWin[ply]} move={move} orientation={me} />
            <Board
              fen={replay.fens[ply]}
              orientation={me}
              lastMove={replay.squares[ply - 1]}
              move={move}
            />
          </div>
          <PlayerStrip
            name={me === 'white' ? game.white : game.black}
            rating={me === 'white' ? game.white_elo : game.black_elo}
            seconds={clockAt(replay.moves, me, ply, replay.baseClock)}
            you
          />
        </div>

        <div className="relative min-h-[28rem]">
          <aside className="flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:absolute lg:inset-0">
            <div className="flex items-center gap-2 border-b px-3 py-2 text-sm">
              <ResultBadge outcome={game.outcome} />
              <span className="min-w-0 truncate">
                {[game.ended_by, longDate(game.played_at), timeControl(game.time_control)].filter(Boolean).join(' · ')}
              </span>
              {game.url && (
                <Button variant="ghost" size="icon-sm" className="ml-auto" asChild>
                  <a href={game.url} target="_blank" rel="noreferrer" aria-label="Open on Chess.com">
                    <ExternalLink />
                  </a>
                </Button>
              )}
            </div>
            {replay.moves.length > 0 && (
              <WinGraph replay={replay} me={me} ply={ply} onSelect={setPly} />
            )}
            <MovePanel
              ply={ply}
              san={san}
              move={move}
              analysed={replay.moves.length > 0}
              mine={ply > 0 && (ply % 2 === 1) === (me === 'white')}
              opponent={me === 'white' ? game.black : game.white}
            />
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
            {tab === 'moves' ? (
              <MoveList san={game.san} moves={replay.moves} ply={ply} onSelect={setPly} />
            ) : (
              <KeyMoments game={game} moves={replay.moves} whiteWin={replay.whiteWin} me={me} ply={ply} onSelect={setPly} />
            )}
            <div className="grid grid-cols-4 gap-2 border-t p-2">
              <NavButton label="First move" onClick={() => setPly(0)} icon={<ChevronFirst />} />
              <NavButton label="Previous move" onClick={() => setPly(Math.max(0, ply - 1))} icon={<ChevronLeft />} />
              <NavButton label="Next move" onClick={() => setPly(Math.min(last, ply + 1))} icon={<ChevronRight />} />
              <NavButton label="Last move" onClick={() => setPly(last)} icon={<ChevronLast />} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
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
}: {
  name: string
  rating: number | null
  seconds: number | null
  you?: boolean
}) {
  return (
    <div className="flex h-9 items-center gap-2 pl-6 text-sm">
      <span className="font-medium">{name}</span>
      <span className="text-muted-foreground">
        {rating}
        {you && ' · you'}
      </span>
      {seconds != null && (
        <span
          className={cn(
            'ml-auto rounded-md bg-muted px-2.5 py-0.5 font-mono text-base tabular-nums',
            seconds < 60 && 'bg-loss/15 text-loss',
          )}
        >
          {clock(seconds)}
        </span>
      )}
    </div>
  )
}

function EvalBar({ whiteWin, move, orientation }: { whiteWin: number; move?: MoveRow; orientation: Side }) {
  const score =
    move?.mate_after != null
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
}: {
  fen: string
  orientation: Side
  lastMove?: { from: string; to: string }
  move?: MoveRow
}) {
  const squareStyles = lastMove
    ? Object.fromEntries(
        [lastMove.from, lastMove.to].map((sq) => [sq, { backgroundColor: isLightSquare(sq) ? LIGHT_HL : DARK_HL }]),
      )
    : {}
  const arrows: Arrow[] =
    move && !isSound(move.classification) && move.best_uci
      ? [{ startSquare: move.best_uci.slice(0, 2), endSquare: move.best_uci.slice(2, 4), color: BEST_ARROW }]
      : []
  const badge = move?.classification && lastMove ? { square: lastMove.to, kind: move.classification } : null

  return (
    <div className="min-w-0 flex-1 overflow-visible rounded-sm">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          allowDragging: false,
          animationDurationInMs: 150,
          lightSquareStyle: { backgroundColor: LIGHT },
          darkSquareStyle: { backgroundColor: DARK },
          lightSquareNotationStyle: { color: DARK },
          darkSquareNotationStyle: { color: LIGHT },
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

function MovePanel({
  ply,
  san,
  move,
  analysed,
  mine,
  opponent,
}: {
  ply: number
  san?: string
  move?: MoveRow
  analysed: boolean
  mine: boolean
  opponent: string
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
  return (
    <div className="min-h-24 border-b px-3 py-2.5 text-sm leading-relaxed">
      <div className="flex items-center gap-2 text-base font-medium">
        <MoveText ply={ply} san={san} number />
        {kind && (
          <span className="ml-auto flex items-center gap-1.5 text-sm font-normal">
            <MoveBadge kind={kind} />
            {CLASSIFICATION[kind].label}
          </span>
        )}
      </div>
      {!analysed || !move ? (
        <p className="text-muted-foreground">Not analysed yet. Run `chessprofile analyze`.</p>
      ) : (
        <>
          <p className="text-muted-foreground">
            {mine ? 'You' : opponent} · win chance {Math.round(move.win_pct_before ?? 0)}% →{' '}
            {Math.round(move.win_pct_after ?? 0)}%
          </p>
          <p className="text-muted-foreground">
            {!isSound(kind ?? null) && move.best_san ? (
              <>
                Best was{' '}
                <span className="font-medium text-foreground">
                  <MoveText ply={ply} san={move.best_san} />
                </span>
              </>
            ) : kind === 'best' ? (
              "The engine's top choice"
            ) : kind === 'excellent' ? (
              'Nearly as good as the best move'
            ) : (
              'A solid move'
            )}
          </p>
          {move.time_spent != null && (
            <p className="text-muted-foreground">
              Spent {thinkTime(move.time_spent)}
              {move.clock_left != null && ` · ${clock(move.clock_left)} left`}
            </p>
          )}
        </>
      )}
    </div>
  )
}

function MoveList({
  san,
  moves,
  ply,
  onSelect,
}: {
  san: string[]
  moves: MoveRow[]
  ply: number
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
                  'w-fit rounded px-1.5 py-0.5 text-left hover:bg-foreground/10',
                  j + 1 === ply && 'bg-foreground/15 font-medium',
                )}
              >
                <MoveText ply={j + 1} san={san[j]} />
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
