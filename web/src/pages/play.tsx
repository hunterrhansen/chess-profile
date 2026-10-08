import { Chess, type Square } from 'chess.js'
import { CircleNotchIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { KnIcon } from '@/components/kn-icon'
import { Board, type Palette } from '@/components/board'
import { Confetti } from '@/components/confetti'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { type AccountStatus, apiFetch, send, useApi } from '@/lib/api'
import { BOARDS, usePreferences } from '@/lib/preferences'
import { durationMs, useWide } from '@/lib/motion'
import { playSound } from '@/lib/sound'
import { cn } from '@/lib/utils'
import { MoveList } from '@/components/review-bits'

type Side = 'white' | 'black'

const LEVELS: { elo: number; label: string }[] = [
  { elo: 250, label: 'Beginner' },
  { elo: 400, label: 'Beginner' },
  { elo: 600, label: 'Novice' },
  { elo: 800, label: 'Novice' },
  { elo: 1000, label: 'Casual' },
  { elo: 1200, label: 'Casual' },
  { elo: 1500, label: 'Intermediate' },
  { elo: 1800, label: 'Club player' },
  { elo: 2200, label: 'Expert' },
  { elo: 3200, label: 'Full strength' },
]
const BOT_DELAY_MS = 500 // the bot never answers faster than this, so its moves can be seen
const STORE = 'knightly.play'

/** A game in progress (or just finished), kept for the browser session so leaving the page
 * or reloading doesn't lose it. */
interface PlayState {
  elo: number
  color: Side
  moves: string[] // UCI
  startedAt: string
  resigned?: Side
  savedId?: number
  /** Blunder check: once per game, the bot stops a move that loses 20+ points of chance. */
  blunderCheck?: boolean
  checkUsed?: boolean
}

/** What Blunder check found about your last move (play.blunder_check). */
interface Check {
  blunder: boolean
  before: number
  after: number | null
  reply_uci?: string | null
  reply_san?: string | null
  wins?: string | null
  mates?: boolean
}

function loadState(): PlayState | null {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) ?? 'null')
  } catch {
    return null
  }
}

function saveState(state: PlayState | null) {
  try {
    if (state) sessionStorage.setItem(STORE, JSON.stringify(state))
    else sessionStorage.removeItem(STORE)
  } catch {
    // storage blocked: the game still works, it just won't survive a reload
  }
}

const botName = (elo: number) => (elo >= 3200 ? 'Stockfish' : `Stockfish ${elo}`)
const levelOf = (elo: number) => LEVELS.find((l) => l.elo === elo)?.label

const PIECE = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' } as const

/** The bot's line when it gives check, naming the piece: "Check! Your king's in the line of my queen." */
function checkLine(chess: Chess) {
  const turn = chess.turn()
  const king = chess.findPiece({ type: 'k', color: turn })[0]
  const by = king ? chess.attackers(king, turn === 'w' ? 'b' : 'w').flatMap((sq) => chess.get(sq)?.type ?? []) : []
  if (by.length > 1) return `Double check! My ${PIECE[by[0]]} and my ${PIECE[by[1]]} both hit your king.`
  if (by[0] === 'n') return "Check! Your king's in my knight's jump."
  if (by[0] === 'p') return "Check! My pawn's hitting your king."
  return by[0] ? `Check! Your king's in the line of my ${PIECE[by[0]]}.` : 'Check!'
}

/** Positions, SAN and last-move squares for the moves so far. */
function useGame(moves: string[]) {
  return useMemo(() => {
    const chess = new Chess()
    const san: string[] = []
    const squares: { from: string; to: string }[] = []
    for (const uci of moves) {
      const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
      san.push(m.san)
      squares.push({ from: m.from, to: m.to })
    }
    return { chess, san, squares }
  }, [moves])
}

/** "You won by checkmate", "Draw by repetition", ... once the game is over. */
function resultText(chess: Chess, me: Side, resigned?: Side) {
  if (resigned) return resigned === me ? { outcome: 'loss', text: 'You resigned' } : { outcome: 'win', text: 'The bot resigned' }
  if (chess.isCheckmate()) {
    const loser: Side = chess.turn() === 'w' ? 'white' : 'black'
    return loser === me ? { outcome: 'loss', text: 'Checkmated' } : { outcome: 'win', text: 'You won by checkmate' }
  }
  const how = chess.isStalemate()
    ? 'stalemate'
    : chess.isInsufficientMaterial()
      ? 'insufficient material'
      : chess.isThreefoldRepetition()
        ? 'repetition'
        : '50-move rule'
  return { outcome: 'draw', text: `Draw by ${how}` }
}

export function PlayPage() {
  const { prefs } = usePreferences()
  const wide = useWide()
  const { data: status } = useApi<AccountStatus>('/api/status')
  const accounts = status?.accounts ?? []
  const you = accounts.find((a) => a.source === 'chesscom')?.handle ?? accounts[0]?.handle ?? 'You'
  // Your rating to pitch the bot against: a game rating (Chess.com's first), never a puzzle one.
  const rating =
    [...accounts]
      .sort((a, b) => Number(b.source === 'chesscom') - Number(a.source === 'chesscom'))
      .find((a) => a.rating != null && a.rating_kind !== 'Puzzles')?.rating ?? null

  const [state, setStateRaw] = useState<PlayState | null>(loadState)
  const setState = useCallback((next: PlayState | null) => {
    saveState(next)
    setStateRaw(next)
  }, [])
  const [setup, setSetup] = useState<Setup>(() => ({
    elo: state?.elo ?? 800,
    color: state?.color ?? 'white',
    blunderCheck: state?.blunderCheck ?? true,
  }))

  const moves = useMemo(() => state?.moves ?? [], [state])
  const { chess, san, squares } = useGame(moves)
  const me: Side = state?.color ?? (setup.color === 'black' ? 'black' : 'white')
  const myTurn = (chess.turn() === 'w') === (me === 'white')
  const over = !!state && (!!state.resigned || chess.isGameOver())
  const playing = !!state && !over

  const [thinking, setThinking] = useState(false)
  const [retry, setRetry] = useState(0) // bumped to ask the bot again after an error
  const [error, setError] = useState<string | null>(null)
  // Hint, in two steps like everywhere else: the piece to move, then the move as an arrow.
  const [hint, setHint] = useState<{ ply: number; uci: string; step: 1 | 2 } | null>(null)
  const [hintLoading, setHintLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<'running' | 'done' | 'failed' | null>(null)
  // Your last move while Blunder check looks at it, then its warning if it's a blunder. The
  // bot waits until it's cleared.
  const [held, setHeld] = useState<{ ply: number; check?: Check } | null>(null)

  // The bot's turn: ask the server, and play its move after a short pause.
  useEffect(() => {
    if (!state || !playing || myTurn || held) return
    const ctrl = new AbortController()
    const fen = chess.fen()
    setThinking(true)
    setError(null)
    Promise.all([
      apiFetch('/api/play/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen, elo: state.elo }),
        signal: ctrl.signal,
      }).then(async (res) => {
        // An empty or non-JSON body (e.g. the dev proxy with the Python server down) still
        // gives a readable error rather than a JSON parse failure.
        const body = await res.json().catch(() => null)
        if (!res.ok || !body) {
          throw new Error(
            typeof body?.detail === 'string'
              ? body.detail
              : `The server didn't answer (${res.status}). Is \`knightly serve\` running?`,
          )
        }
        return body as { uci: string }
      }),
      new Promise((r) => setTimeout(r, BOT_DELAY_MS)),
    ])
      .then(([move]) => {
        setThinking(false)
        setState({ ...state, moves: [...state.moves, move.uci] })
      })
      .catch((e: Error) => {
        if (e.name === 'AbortError') return
        setThinking(false)
        setError(e.message)
      })
    return () => {
      ctrl.abort()
      setThinking(false)
    }
    // Only a new position (or a new game) should trigger a move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves, playing, myTurn, retry, held])

  // A finished game is saved as an unrated game, then analysed so it can be reviewed. The
  // ref keeps it to one save per game, even when the effect runs twice.
  const saving = useRef<string | null>(null)
  useEffect(() => {
    if (!state || !over || state.savedId || !state.moves.length || saving.current === state.startedAt) return
    saving.current = state.startedAt
    send<{ id: number }>('POST', '/api/play/games', {
      moves: state.moves,
      color: state.color,
      elo: state.elo,
      bot: botName(state.elo),
      resigned: state.resigned ?? null,
      started_at: state.startedAt,
    })
      .then(({ id }) => {
        // Only if this game is still the one on the board.
        setStateRaw((cur) => {
          if (cur?.startedAt !== state.startedAt) return cur
          const next = { ...cur, savedId: id }
          saveState(next)
          return next
        })
        setAnalysis('running')
        return send('POST', `/api/play/games/${id}/analysis`).then(
          () => setAnalysis('done'),
          () => setAnalysis('failed'),
        )
      })
      .catch((e: Error) => setError(`Couldn't save the game. ${e.message}`))
  }, [state, over])

  const tryMove = (from: string, to: string) => {
    if (!state || !playing || !myTurn) return false
    const probe = new Chess(chess.fen())
    try {
      // Promotions always make a queen.
      const m = probe.move({ from, to, promotion: 'q' })
      const uci = m.from + m.to + (m.promotion ?? '')
      const next = { ...state, moves: [...state.moves, uci] }
      setState(next)
      setSelected(null)
      setHint(null)
      if (state.blunderCheck && !state.checkUsed && !probe.isGameOver()) {
        const ply = next.moves.length
        setHeld({ ply })
        send<Check>('POST', '/api/play/check', { fen: chess.fen(), uci })
          .then((check) => {
            if (!check.blunder) return setHeld(null)
            setHeld({ ply, check })
            setState({ ...next, checkUsed: true }) // shown once: this was the game's check
          })
          .catch(() => setHeld(null)) // no engine: just play on
      }
      return true
    } catch {
      return false
    }
  }

  const start = () => {
    const color = setup.color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : setup.color
    setHint(null)
    setSelected(null)
    setError(null)
    setAnalysis(null)
    setHeld(null)
    playSound('gameStart')
    setState({ elo: setup.elo, color, moves: [], startedAt: new Date().toISOString(), blunderCheck: setup.blunderCheck })
  }

  // Blunder check's two answers: undo the move (the bot never saw it), or let it stand.
  const takeItBack = () => {
    if (!state) return
    setHeld(null)
    setState({ ...state, moves: state.moves.slice(0, -1) })
  }
  const playAnyway = () => setHeld(null)
  const warning = held?.check && held.ply === moves.length ? held.check : null

  const takeback = () => {
    // Back to the last position where it was your move: your move and the bot's reply.
    if (warning) return takeItBack()
    const back = myTurn ? 2 : 1
    if (!state || !playing || state.moves.length < back) return
    setHint(null)
    setSelected(null)
    setState({ ...state, moves: state.moves.slice(0, -back) })
  }

  const askHint = async () => {
    if (!playing || !myTurn) return
    if (hint?.ply === moves.length) return setHint({ ...hint, step: 2 })
    setHintLoading(true)
    try {
      const move = await send<{ uci: string }>('POST', '/api/play/move', { fen: chess.fen() })
      setHint({ ply: moves.length, uci: move.uci, step: 1 })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setHintLoading(false)
    }
  }

  const resign = () => {
    if (state && playing && window.confirm('Resign this game?')) setState({ ...state, resigned: me })
  }

  const result = over && state ? resultText(chess, me, state.resigned) : null
  const elo = state?.elo ?? setup.elo

  // A game that ends while you watch gets its moment; a finished game you come back to (a
  // reload) is shown as it ended, quietly.
  const [cameBack, setCameBack] = useState(over)
  if (cameBack && !over) setCameBack(false)
  const live = over && !cameBack
  // The ending's sound once the last move has landed. A mate needs none: the board plays the
  // checkmate sound as it lands.
  const outcome = result?.outcome
  const mate = chess.isCheckmate()
  useEffect(() => {
    if (!outcome || !live || mate) return
    return playSound(outcome === 'win' ? 'win' : 'gameOver', durationMs('--duration-move') + 150)
  }, [outcome, live, mate])
  // After a mate the result waits for the king to fall (board.tsx); otherwise it comes at once.
  const resultDelay = { animationDelay: live && mate ? 'calc(var(--duration-move) + 1000ms)' : '0ms' }

  const level = levelOf(elo)
  const moveNumber = Math.floor(moves.length / 2) + 1
  const says = !state
    ? null
    : error
      ? error
      : result
        ? result.outcome === 'win'
          ? 'Well played! You got me.'
          : result.outcome === 'loss'
            ? 'Good game! Fancy a rematch?'
            : 'A draw. Fair enough!'
        : warning
          ? 'Hmm, are you sure about that?'
          : thinking || held
            ? null
            : moves.length < 2
              ? `Good luck! I play at about ${state.elo}.`
              : chess.inCheck() && myTurn
                ? checkLine(chess)
                : 'Your move.'

  const board = (
    <PlayBoard
      chess={chess}
      orientation={me}
      lastMove={squares[squares.length - 1]}
      hint={hint?.ply === moves.length && hint.step === 2 ? hint.uci : null}
      glow={hint?.ply === moves.length && hint.step === 1 ? hint.uci.slice(0, 2) : null}
      danger={warning?.reply_uci ?? null}
      selected={selected}
      interactive={playing && myTurn}
      palette={BOARDS[prefs.board]}
      onMove={tryMove}
      onSelect={setSelected}
    />
  )
  const yourLine = <Strip name={you} note={[rating, `you, ${me === 'white' ? 'White' : 'Black'}`].filter(Boolean).join(' · ')} />
  const blunderWarning = (band?: boolean) =>
    warning && (
      <BlunderWarning
        check={warning}
        you={san[san.length - 1]}
        them={me === 'white' ? 'Black' : 'White'}
        onBack={takeItBack}
        onPlay={playAnyway}
        band={band}
      />
    )
  const retryButton = error && playing && !myTurn && (
    <Button size="sm" variant="outline" onClick={() => setRetry((n) => n + 1)}>
      Try again
    </Button>
  )
  // The game's three buttons, labelled. Hint gets the room for its second step's longer name
  // (which drops the bulb to fit).
  const actions = (
    <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
      <Button
        variant="secondary"
        className="h-10 px-2 text-[13px]"
        onClick={askHint}
        disabled={!playing || !myTurn || hintLoading || (hint?.ply === moves.length && hint.step === 2)}
      >
        {hintLoading ? (
          <>
            <CircleNotchIcon className="size-5 animate-spin" /> Hint
          </>
        ) : hint?.ply === moves.length ? (
          'Show the move'
        ) : (
          <>
            <KnIcon glyph="hint" className="size-5" /> Hint
          </>
        )}
      </Button>
      <Button variant="secondary" className="h-10 px-2 text-[13px]" onClick={takeback} disabled={!playing || !moves.length}>
        Take back
      </Button>
      <Button variant="secondary" className="h-10 px-2 text-[13px] text-danger-text" onClick={resign} disabled={!playing}>
        Resign
      </Button>
    </div>
  )
  const resultCard = (compact?: boolean) =>
    state &&
    result &&
    (mate ? (
      <MateCard
        won={result.outcome === 'win'}
        bot={botName(state.elo)}
        san={san[san.length - 1]}
        moveNumber={Math.ceil(san.length / 2)}
        live={live}
        compact={compact}
        style={resultDelay}
      />
    ) : (
      <p
        className={cn(
          'text-base font-semibold',
          result.outcome === 'win' ? 'text-win' : result.outcome === 'loss' ? 'text-loss' : 'text-draw',
        )}
      >
        {result.text}
      </p>
    ))
  const afterGame = state && result && (
    <>
      <div className="flex animate-rise flex-col gap-2" style={resultDelay}>
        {state.savedId &&
          (analysis === 'running' ? (
            <Button size="lg" disabled>
              <CircleNotchIcon className="animate-spin" /> Analysing…
            </Button>
          ) : (
            <Button size="lg" asChild>
              <Link to={`/games/${state.savedId}`}>Review game</Link>
            </Button>
          ))}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={start}>
            Rematch
          </Button>
          <Button variant="outline" onClick={() => setState(null)}>
            New game
          </Button>
        </div>
      </div>
      {analysis === 'failed' && (
        <p className="text-muted-foreground">Saved, but the analysis didn't run. `knightly analyze` will pick it up.</p>
      )}
    </>
  )

  // On a phone, one screen with no scrolling: the bot and what it says on top, the board the
  // full width, and along the bottom Blunder check, the result, or the game's buttons. The
  // shell's top bar (3.5rem) sits above, its tab bar over the bottom (TAB_BAR).
  if (!wide) {
    return (
      <div className={cn('-mx-4 -mt-6 -mb-30 flex h-[calc(100svh-3.5rem)] flex-col overflow-hidden', TAB_BAR)}>
        {!state ? (
          <>
            <h1 className="flex shrink-0 items-center gap-2.5 px-4 pt-4 font-heading text-2xl font-bold">
              <KnIcon glyph="engine" className="size-8" /> Play the bot
            </h1>
            <Setup setup={setup} rating={rating} onChange={setSetup} onStart={start} />
          </>
        ) : (
          <>
            <header className="flex shrink-0 items-center gap-2.5 px-4 py-2.5" aria-live="polite">
              <KnIcon glyph="engine" className="size-9 shrink-0" />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate font-extrabold">{botName(state.elo)}</p>
                <p className={cn('line-clamp-2 text-[13px] text-muted-foreground', error && 'text-destructive')}>
                  {says ?? <Thinking />}
                </p>
              </div>
              <span className="shrink-0 rounded-[10px] bg-surface-muted px-2.5 py-1 font-mono text-sm tabular-nums">
                {moveNumber}.
              </span>
            </header>
            {/* 1.75rem: your line under the board. */}
            <div className="min-h-40 flex-1 px-4 [container-type:size]">
              <section aria-label="Board" className="mx-auto flex w-[min(100cqw,calc(100cqh-1.75rem))] flex-col">
                <div className="flex">{board}</div>
                {yourLine}
              </section>
            </div>
            {warning ? (
              blunderWarning(true)
            ) : result ? (
              <footer className="flex shrink-0 flex-col gap-2.5 border-t-2 bg-card px-4 py-3 text-sm">
                {resultCard(true)}
                {afterGame}
              </footer>
            ) : (
              <footer className="flex shrink-0 flex-col items-start gap-2 px-4 pt-2 pb-3 [&>:last-child]:w-full">
                {retryButton}
                {actions}
              </footer>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-5 items-center text-sm font-medium">Play vs bot</div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="mx-auto flex w-full max-w-[calc(100svh-170px)] min-w-72 flex-col gap-1.5">
          <Strip bot name={botName(elo)} note={level ?? ''} />
          {board}
          {yourLine}
        </div>

        <div className="relative min-h-[28rem]">
          <aside className="panel flex flex-col overflow-hidden lg:absolute lg:inset-0">
            <div className="flex items-center justify-center gap-2 border-b px-3 py-3 font-semibold">
              <KnIcon glyph="engine" className="size-6" /> Play bot
            </div>

            {!state ? (
              <Setup setup={setup} rating={rating} onChange={setSetup} onStart={start} />
            ) : (
              <>
                <BotSays elo={state.elo} text={says} error={!!error} />
                {blunderWarning()}
                {retryButton && <div className="border-b px-3 py-2">{retryButton}</div>}
                {result && (
                  <div className="relative flex flex-col gap-3 border-b px-3 py-3 text-sm">
                    {resultCard()}
                    {afterGame}
                  </div>
                )}
                <div className="flex min-h-0 flex-1 flex-col">
                  {san.length ? (
                    <MoveList san={san} moves={[]} ply={san.length} onSelect={() => {}} />
                  ) : (
                    <p className="px-3 py-2.5 text-sm text-muted-foreground">
                      {me === 'white' ? 'You have White. Make the first move.' : 'You have Black.'}
                    </p>
                  )}
                </div>
                <div className="border-t p-2">{actions}</div>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}

/** Bottom padding for a phone screen that fits above the shell's tab bar. */
const TAB_BAR = 'pb-[calc(4.5rem+max(10px,env(safe-area-inset-bottom)))]'

/** A player's line by the board: the bot with its avatar and level, or you with your rating
 * and side ("934 · you, White"). */
function Strip({ name, note, bot }: { name: string; note: string; bot?: boolean }) {
  return (
    <div className="flex h-7 min-w-0 items-center gap-2.5 text-sm md:h-9">
      {bot && <KnIcon glyph="engine" className="size-7 shrink-0" />}
      <span className="truncate font-extrabold">{name}</span>
      <span className="shrink-0 text-muted-foreground">{note}</span>
    </div>
  )
}

function Thinking() {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <CircleNotchIcon className="size-3.5 animate-spin" /> Thinking…
    </span>
  )
}

interface Setup {
  elo: number
  color: Side | 'random'
  blunderCheck: boolean
}

function Setup({
  setup,
  rating,
  onChange,
  onStart,
}: {
  setup: Setup
  /** Your game rating, to point out the strength nearest it. */
  rating: number | null
  onChange: (s: Setup) => void
  onStart: () => void
}) {
  const level = LEVELS.find((l) => l.elo === setup.elo)
  const nearest = rating == null ? null : LEVELS.reduce((a, b) => (Math.abs(b.elo - rating) < Math.abs(a.elo - rating) ? b : a))
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3 text-sm">
      <BotSays elo={setup.elo} text={`Hi! Pick how strong I should be. ${level ? `At ${setup.elo} I'm ${level.label.toLowerCase()} level.` : ''}`} />
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Strength</span>
        <div className="grid grid-cols-5 gap-1.5">
          {LEVELS.map((l) => (
            <button
              key={l.elo}
              onClick={() => onChange({ ...setup, elo: l.elo })}
              aria-pressed={l.elo === setup.elo}
              title={l.label}
              className={cn(
                'rounded-md bg-muted py-1.5 tabular-nums hover:bg-foreground/10',
                l.elo === setup.elo && 'bg-primary text-primary-foreground hover:bg-primary',
              )}
            >
              {l.elo >= 3200 ? 'Max' : l.elo}
            </button>
          ))}
        </div>
        <span className="text-muted-foreground">
          {setup.elo >= 3200 ? level?.label : `${setup.elo} · ${level?.label}`}.
          {nearest?.elo === setup.elo && ` About your rating (${rating}).`}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">You play</span>
        <div className="grid grid-cols-3 gap-1.5">
          {(['white', 'random', 'black'] as const).map((c) => (
            <button
              key={c}
              onClick={() => onChange({ ...setup, color: c })}
              aria-pressed={c === setup.color}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-md bg-muted py-1.5 capitalize hover:bg-foreground/10',
                c === setup.color && 'bg-primary text-primary-foreground hover:bg-primary',
              )}
            >
              <span
                className={cn(
                  'size-3 rounded-full border border-foreground/40',
                  c === 'white' ? 'bg-eval-white' : c === 'black' ? 'bg-eval-black' : 'bg-linear-to-r from-eval-white from-50% to-eval-black to-50%',
                )}
              />
              {c}
            </button>
          ))}
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-3 rounded-md bg-sky/12 px-3.5 py-3 shadow-[inset_0_0_0_2px_var(--sky)]">
        <span className="min-w-0 flex-1">
          <span className="block font-extrabold">Blunder check</span>
          <span className="block text-[13px] text-muted-foreground">The bot stops you once per game before a move that loses a lot.</span>
        </span>
        <Switch checked={setup.blunderCheck} onCheckedChange={(c) => onChange({ ...setup, blunderCheck: c })} />
      </label>
      <Button size="lg" className="mt-auto h-11 text-base" onClick={onStart}>
        Play
      </Button>
      <p className="text-xs text-muted-foreground">
        Finished games are saved as unrated games, so you can review them. They stay out of your Progress stats.
      </p>
    </div>
  )
}

/** Blunder check's warning: what your move allows, how much it costs, and the two ways on. */
export function BlunderWarning({
  check,
  you,
  them,
  onBack,
  onPlay,
  band,
}: {
  check: Check
  you: string
  them: string
  onBack: () => void
  onPlay: () => void
  /** On a phone: a gold band along the bottom, in fewer words. */
  band?: boolean
}) {
  const what = check.mates ? ' and mates' : check.wins ? ` and wins your ${check.wins}` : ''
  if (band) {
    return (
      <section aria-live="assertive" className="flex shrink-0 animate-sheet flex-col gap-2.5 border-t-2 border-gold-lip bg-gold/18 px-4 pt-3.5 pb-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold text-[22px] font-black text-on-gold shadow-[inset_0_-3px_0_var(--move-shade)]">
            !
          </span>
          <div>
            <h2 className="font-heading text-xl font-semibold">Blunder check</h2>
            <p className="text-sm">
              After <b>{you}</b>,{' '}
              {what ? (
                <>
                  <b>{check.reply_san}</b>
                  {what.slice(' and'.length)}
                </>
              ) : (
                <>
                  {them} plays <b>{check.reply_san}</b>
                </>
              )}
              . Your chance: {check.before}% → {check.after}%.
            </p>
          </div>
        </div>
        <Button size="lg" className="w-full" onClick={onBack}>
          Take it back
        </Button>
        <Button variant="ghost" className="w-full" onClick={onPlay}>
          Play it anyway
        </Button>
      </section>
    )
  }
  return (
    <section aria-live="assertive" className="m-3 flex animate-sheet flex-col gap-3 rounded-xl border-2 border-gold-lip bg-card p-4 shadow-[0_4px_0_var(--gold-lip)]">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold text-xl font-black text-on-gold shadow-[inset_0_-3px_0_var(--move-shade)]">
          !
        </span>
        <h2 className="font-heading text-xl font-semibold">Blunder check</h2>
      </div>
      <p className="text-[15px]">
        After <b>{you}</b>, {them} plays <b>{check.reply_san}</b>
        {what}. Your chance would drop from {check.before}% to {check.after}%.
      </p>
      <p className="text-[13px] text-muted-foreground">The red arrow shows the reply. This is your one check for this game.</p>
      <Button className="w-full" onClick={onBack}>
        Take it back
      </Button>
      <Button variant="ghost" className="w-full" onClick={onPlay}>
        Play it anyway
      </Button>
    </section>
  )
}

/** The bot's avatar and a speech bubble; `text` null shows it thinking. */
export function BotSays({ elo, text, error }: { elo: number; text: string | null; error?: boolean }) {
  return (
    <div className="flex items-start gap-3 border-b px-3 py-4" aria-live="polite">
      <KnIcon glyph="engine" title={botName(elo)} className="size-11 shrink-0" />
      <div
        className={cn(
          'panel relative min-h-11 flex-1 px-3 py-2 text-sm',
          error && 'text-destructive',
        )}
      >
        {text ?? <Thinking />}
      </div>
    </div>
  )
}

/** The board for making moves yourself: click or drag, with legal-move dots. */
export function PlayBoard({
  chess,
  orientation,
  lastMove,
  hint,
  danger,
  selected,
  interactive,
  palette,
  flash,
  glow,
  onMove,
  onSelect,
}: {
  chess: Chess
  orientation: Side
  lastMove?: { from: string; to: string }
  hint: string | null
  /** The reply that punishes your move (Blunder check), as a red arrow. */
  danger?: string | null
  selected: string | null
  interactive: boolean
  palette: Palette
  /** Lights a square up once after the piece lands: green for a right answer, red for wrong. */
  flash?: { square: string; tone: 'right' | 'wrong' }
  /** Hint: a gold glow on the piece to move. */
  glow?: string | null
  onMove: (from: string, to: string) => boolean
  onSelect: (square: string | null) => void
}) {
  const targets = new Set<string>(
    interactive && selected ? chess.moves({ square: selected as Square, verbose: true }).map((m) => m.to) : [],
  )
  return (
    <Board
      fen={chess.fen()}
      orientation={orientation}
      palette={palette}
      lastMove={lastMove}
      selected={selected}
      targets={targets}
      arrows={[
        ...(hint ? [{ from: hint.slice(0, 2), to: hint.slice(2, 4), tone: 'best' as const }] : []),
        ...(danger ? [{ from: danger.slice(0, 2), to: danger.slice(2, 4), tone: 'danger' as const }] : []),
      ]}
      flash={flash}
      glow={glow}
      movable={interactive ? (orientation === 'white' ? 'w' : 'b') : undefined}
      onMove={onMove}
      onSelect={onSelect}
    />
  )
}

/**
 * The result after a checkmate, once the king has fallen: a gold card with a trophy and
 * confetti when you mated the bot, a calm one with the # mark when it mated you.
 */
function MateCard({
  won,
  bot,
  san,
  moveNumber,
  live,
  compact,
  style,
}: {
  won: boolean
  bot: string
  san: string
  moveNumber: number
  live: boolean
  /** On a phone, in the band along the bottom: the trophy beside the words, not above them. */
  compact?: boolean
  style: React.CSSProperties
}) {
  if (!won) {
    return (
      <div className={cn('flex animate-rise flex-col gap-1.5 rounded-xl border-2 bg-card', compact ? 'p-3' : 'p-3.5')} style={style}>
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-danger text-xl font-black text-on-danger shadow-[inset_0_-3px_0_var(--move-shade)]">
            #
          </span>
          <span className="font-heading text-xl font-bold">Checkmated</span>
        </div>
        <p className="text-[15px]">
          {bot} mated you with {san} on move {moveNumber}. The review shows where it turned.
        </p>
      </div>
    )
  }
  return (
    <div
      className={cn(
        'relative flex animate-rise rounded-xl border-2 border-gold-lip bg-gold text-on-gold shadow-[0_4px_0_var(--gold-lip)]',
        compact ? 'items-center gap-3 p-3' : 'flex-col items-center gap-1.5 p-4 text-center',
      )}
      style={style}
    >
      {/* Silent: the checkmate sound is this moment's sound. */}
      {live && <Confetti silent delay="calc(var(--duration-move) + 1150ms)" />}
      <span
        className={cn(
          'grid shrink-0 animate-bounce-in place-items-center rounded-full bg-card shadow-[0_3px_0_var(--gold-lip)]',
          compact ? 'size-14' : 'size-18',
        )}
        style={style}
      >
        <KnIcon glyph="trophy" className={compact ? 'size-10' : 'size-12'} />
      </span>
      <span className={cn('flex min-w-0 flex-col', compact ? 'gap-0.5' : 'items-center gap-1.5')}>
        <span className="text-sm font-extrabold tracking-[.06em] uppercase">Checkmate</span>
        <span className="font-heading text-xl leading-tight font-bold text-balance">You beat {bot}!</span>
        <span className="text-sm">
          {san} on move {moveNumber}.{!compact && ' Saved as unrated, so you can review it.'}
        </span>
      </span>
    </div>
  )
}
