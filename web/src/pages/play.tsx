import { Chess, type Square } from 'chess.js'
import { ArrowUUpLeftIcon, CircleNotchIcon, FlagIcon, LightbulbIcon, RobotIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Board, type Palette } from '@/components/board'
import { Button } from '@/components/ui/button'
import { send, useApi } from '@/lib/api'
import { BOARDS, usePreferences } from '@/lib/preferences'
import { durationMs } from '@/lib/motion'
import { playSound } from '@/lib/sound'
import { cn } from '@/lib/utils'
import { MoveList, NavButton, PlayerStrip } from '@/pages/review'

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
  const { data: accounts } = useApi<{ source: string; handle: string }[]>('/api/accounts')
  const you = accounts?.find((a) => a.source === 'chesscom')?.handle ?? accounts?.[0]?.handle ?? 'You'

  const [state, setStateRaw] = useState<PlayState | null>(loadState)
  const setState = useCallback((next: PlayState | null) => {
    saveState(next)
    setStateRaw(next)
  }, [])
  const [setup, setSetup] = useState<{ elo: number; color: Side | 'random' }>(() => ({
    elo: state?.elo ?? 800,
    color: state?.color ?? 'white',
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
  const [hint, setHint] = useState<{ ply: number; uci: string } | null>(null)
  const [hintLoading, setHintLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<'running' | 'done' | 'failed' | null>(null)

  // The bot's turn: ask the server, and play its move after a short pause.
  useEffect(() => {
    if (!state || !playing || myTurn) return
    const ctrl = new AbortController()
    const fen = chess.fen()
    setThinking(true)
    setError(null)
    Promise.all([
      fetch('/api/play/move', {
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
  }, [moves, playing, myTurn, retry])

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
      setState({ ...state, moves: [...state.moves, m.from + m.to + (m.promotion ?? '')] })
      setSelected(null)
      setHint(null)
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
    setState({ elo: setup.elo, color, moves: [], startedAt: new Date().toISOString() })
  }

  const takeback = () => {
    // Back to the last position where it was your move: your move and the bot's reply.
    const back = myTurn ? 2 : 1
    if (!state || !playing || state.moves.length < back) return
    setHint(null)
    setSelected(null)
    setState({ ...state, moves: state.moves.slice(0, -back) })
  }

  const askHint = async () => {
    if (!playing || !myTurn) return
    setHintLoading(true)
    try {
      const move = await send<{ uci: string }>('POST', '/api/play/move', { fen: chess.fen() })
      setHint({ ply: moves.length, uci: move.uci })
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

  // The game ending gets its sound once the last move has landed; a finished game you come
  // back to stays quiet.
  const endedBefore = useRef(over)
  const outcome = result?.outcome
  useEffect(() => {
    if (!outcome) {
      endedBefore.current = false
      return
    }
    if (endedBefore.current) return
    return playSound(outcome === 'win' ? 'win' : 'gameOver', durationMs('--duration-move') + 150)
  }, [outcome])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-5 items-center text-sm font-medium">Play vs bot</div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="mx-auto flex w-full max-w-[calc(100svh-170px)] min-w-72 flex-col gap-1.5">
          <PlayerStrip name={botName(elo)} rating={elo} seconds={null} inset={false} />
          <PlayBoard
            chess={chess}
            orientation={me}
            lastMove={squares[squares.length - 1]}
            hint={hint?.ply === moves.length ? hint.uci : null}
            selected={selected}
            interactive={playing && myTurn}
            palette={BOARDS[prefs.board]}
            onMove={tryMove}
            onSelect={setSelected}
          />
          <PlayerStrip name={you} rating={null} seconds={null} you inset={false} />
        </div>

        <div className="relative min-h-[28rem]">
          <aside className="panel flex flex-col overflow-hidden lg:absolute lg:inset-0">
            <div className="flex items-center justify-center gap-2 border-b px-3 py-3 font-semibold">
              <RobotIcon weight="fill" className="size-5" /> Play bot
            </div>

            {!state ? (
              <Setup setup={setup} onChange={setSetup} onStart={start} />
            ) : (
              <>
                <BotSays
                  elo={state.elo}
                  text={
                    error
                      ? error
                      : result
                        ? result.outcome === 'win'
                          ? 'Well played! You got me.'
                          : result.outcome === 'loss'
                            ? 'Good game! Fancy a rematch?'
                            : 'A draw. Fair enough!'
                        : thinking
                          ? null
                          : moves.length < 2
                            ? `Good luck! I play at about ${state.elo}.`
                            : chess.inCheck() && myTurn
                              ? 'Check!'
                              : 'Your move.'
                  }
                  error={!!error}
                />
                {error && playing && !myTurn && (
                  <div className="border-b px-3 py-2">
                    <Button size="sm" variant="outline" onClick={() => setRetry((n) => n + 1)}>
                      Try again
                    </Button>
                  </div>
                )}
                {result && (
                  <div className="flex flex-col gap-2 border-b px-3 py-3 text-sm">
                    <p
                      className={cn(
                        'text-base font-semibold',
                        result.outcome === 'win' ? 'text-win' : result.outcome === 'loss' ? 'text-loss' : 'text-draw',
                      )}
                    >
                      {result.text}
                    </p>
                    <div className="flex gap-2">
                      {state.savedId &&
                        (analysis === 'running' ? (
                          <Button size="sm" disabled>
                            <CircleNotchIcon className="animate-spin" /> Analysing…
                          </Button>
                        ) : (
                          <Button size="sm" asChild>
                            <Link to={`/games/${state.savedId}`}>Review game</Link>
                          </Button>
                        ))}
                      <Button size="sm" variant="outline" onClick={() => setState(null)}>
                        New game
                      </Button>
                      <Button size="sm" variant="outline" onClick={start}>
                        Rematch
                      </Button>
                    </div>
                    {analysis === 'failed' && (
                      <p className="text-muted-foreground">Saved, but the analysis didn't run. `knightly analyze` will pick it up.</p>
                    )}
                  </div>
                )}
                <div className="flex min-h-0 flex-1 flex-col">
                  {san.length ? (
                    <MoveList san={san} moves={[]} ply={san.length} noted={new Set()} onSelect={() => {}} />
                  ) : (
                    <p className="px-3 py-2.5 text-sm text-muted-foreground">
                      {me === 'white' ? 'You have White. Make the first move.' : 'You have Black.'}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 border-t p-2">
                  <NavButton label="Resign" onClick={resign} icon={<FlagIcon weight="fill" />} disabled={!playing} />
                  <NavButton label="Take back" onClick={takeback} icon={<ArrowUUpLeftIcon />} disabled={!playing || !moves.length} />
                  <NavButton
                    label="Hint"
                    onClick={askHint}
                    disabled={!playing || !myTurn || hintLoading}
                    icon={hintLoading ? <CircleNotchIcon className="animate-spin" /> : <LightbulbIcon weight="fill" />}
                  />
                </div>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}

function Setup({
  setup,
  onChange,
  onStart,
}: {
  setup: { elo: number; color: Side | 'random' }
  onChange: (s: { elo: number; color: Side | 'random' }) => void
  onStart: () => void
}) {
  const level = LEVELS.find((l) => l.elo === setup.elo)
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
      <Button size="lg" className="mt-auto h-11 text-base" onClick={onStart}>
        Play
      </Button>
      <p className="text-xs text-muted-foreground">
        Finished games are saved as unrated games, so you can review them. They stay out of your Progress stats.
      </p>
    </div>
  )
}

/** The bot's avatar and a speech bubble; `text` null shows it thinking. */
function BotSays({ elo, text, error }: { elo: number; text: string | null; error?: boolean }) {
  return (
    <div className="flex items-start gap-3 border-b px-3 py-4" aria-live="polite">
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
        title={botName(elo)}
      >
        <RobotIcon weight="fill" className="size-7" />
      </span>
      <div
        className={cn(
          'panel relative min-h-11 flex-1 px-3 py-2 text-sm',
          error && 'text-destructive',
        )}
      >
        {text ?? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <CircleNotchIcon className="size-3.5 animate-spin" /> Thinking…
          </span>
        )}
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
  selected,
  interactive,
  palette,
  flash,
  onMove,
  onSelect,
}: {
  chess: Chess
  orientation: Side
  lastMove?: { from: string; to: string }
  hint: string | null
  selected: string | null
  interactive: boolean
  palette: Palette
  /** Lights a square up once after the piece lands: green for a right answer, red for wrong. */
  flash?: { square: string; tone: 'right' | 'wrong' }
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
      arrows={hint ? [{ from: hint.slice(0, 2), to: hint.slice(2, 4), tone: 'best' }] : []}
      flash={flash}
      movable={interactive ? (orientation === 'white' ? 'w' : 'b') : undefined}
      onMove={onMove}
      onSelect={onSelect}
    />
  )
}
