import { Chess } from 'chess.js'
import { ArrowSquareOutIcon, CheckIcon, XIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Confetti } from '@/components/confetti'
import { KnIcon } from '@/components/kn-icon'
import { LessonBar, LessonBoard, LessonScreen, LessonVerdict } from '@/components/lesson-bar'
import { EmptyState, LoadingBlock } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { type Puzzle, type PuzzleNext, send } from '@/lib/api'
import { durationMs } from '@/lib/motion'
import { patternOf, tacticHint } from '@/lib/patterns'
import { BOARDS, usePreferences } from '@/lib/preferences'
import { playSound } from '@/lib/sound'
import { cn } from '@/lib/utils'
import { PlayBoard } from '@/pages/play'

const REPLY_MS = 600 // the opponent's moves in a puzzle, after yours
const PIECE: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

/** How a puzzle went: solved on the first try, solved after a miss or a hint, or shown. */
type PuzzleOutcome = 'solved' | 'helped' | 'missed'

const toMove = (uci: string) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })

/**
 * Puzzles for the tactic behind most of your mistakes (?theme=hangingPiece), from the
 * Lichess puzzle database. A lesson like Practice: full screen, a set of SESSION puzzles,
 * then a summary. A wrong move slides back so you can try again (Hint helps); Show me ends the
 * puzzle as a miss and shows the answer. Only a clean first try counts as solved.
 */
export function PuzzlesPage() {
  const [params] = useSearchParams()
  const theme = params.get('theme') ?? 'hangingPiece'
  const pattern = patternOf(theme)
  const [next, setNext] = useState<PuzzleNext | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<PuzzleOutcome[]>([])

  const load = useCallback(() => {
    setNext(null)
    fetch(`/api/puzzles/next?theme=${encodeURIComponent(theme)}`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.detail ?? r.status)
        setNext(body)
      })
      .catch((e: Error) => setError(e.message))
  }, [theme])
  useEffect(load, [load])

  const session = next?.session ?? 5
  const finished = results.length >= session

  // A puzzle is a lesson screen: one window high, the answer bar along the bottom.
  const Screen = !finished && next?.puzzle ? LessonScreen : Column
  return (
    <Screen>
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Stop for now">
          <Link to="/">
            <XIcon />
          </Link>
        </Button>
        <Progress className="flex-1" label="Puzzles" hideLabel value={(results.length / session) * 100} />
        <span key={results.length} className="animate-bump text-sm font-extrabold tabular-nums">
          {Math.min(results.length, session)} of {session}
        </span>
      </header>

      {error && <p className="text-sm text-destructive">Couldn't load a puzzle. {error}</p>}
      {finished ? (
        <Done results={results} label={pattern?.label ?? theme} />
      ) : !next ? (
        <LoadingBlock label="Finding a puzzle…" className="aspect-square w-full rounded-xl" />
      ) : !next.available ? (
        <Card>
          <EmptyState title="No puzzles yet">
            Puzzles come from the Lichess puzzle database. Download lichess_db_puzzle.csv.zst from
            database.lichess.org, then run <code className="font-mono text-xs">knightly puzzles</code> on it.
          </EmptyState>
        </Card>
      ) : !next.puzzle ? (
        <Card>
          <EmptyState title="You've done them all">Every {pattern?.label.toLowerCase() ?? theme} puzzle here is done. Import a newer file for more.</EmptyState>
        </Card>
      ) : (
        <PuzzleBoard
          key={next.puzzle.id}
          puzzle={next.puzzle}
          label={pattern?.one ?? theme}
          tactic={tacticHint(theme, 'chance')}
          onDone={(outcome) => setResults((r) => [...r, outcome])}
          onNext={load}
          last={results.length + 1 >= session}
        />
      )}
    </Screen>
  )
}

function Column({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-xl flex-col gap-5">{children}</div>
}

function PuzzleBoard({
  puzzle,
  label,
  tactic,
  onDone,
  onNext,
  last,
}: {
  puzzle: Puzzle
  label: string
  /** Hint's first rung: the theme in words. */
  tactic: string | null
  onDone: (outcome: PuzzleOutcome) => void
  onNext: () => void
  last: boolean
}) {
  const { prefs } = usePreferences()
  const [played, setPlayed] = useState(0) // how many of puzzle.moves are on the board
  const [selected, setSelected] = useState<string | null>(null)
  const [result, setResult] = useState<PuzzleOutcome | null>(null)
  // Like Practice: a wrong move slides back and you try again; Hint lights up the piece, then
  // shows the move. Only a clean first try counts as solved (Lichess's rule for its ratings).
  const [helped, setHelped] = useState(false)
  const [notQuite, setNotQuite] = useState<string | null>(null) // the square of a wrong try
  // Hint's rungs, one per tap: the theme in words, the piece, then the move as an arrow.
  const rungs = tactic ? (['tactic', 'piece', 'move'] as const) : (['piece', 'move'] as const)
  const [hints, setHints] = useState(0)
  const rung = hints ? rungs[hints - 1] : null
  const [hintReady, setHintReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setHintReady(true), 2000)
    return () => clearTimeout(t)
  }, [])

  const chess = useMemo(() => {
    const c = new Chess(puzzle.fen)
    for (const uci of puzzle.moves.slice(0, played)) c.move(toMove(uci))
    return c
  }, [puzzle, played])
  // You play the side to move after the setting-up move.
  const me = useMemo(() => (new Chess(puzzle.fen).turn() === 'w' ? 'black' : 'white'), [puzzle.fen])
  const yourTurn = played % 2 === 1 && !result

  // The opponent's moves: the setting-up one at the start, then each answer to yours.
  useEffect(() => {
    if (result || played % 2 === 1 || played >= puzzle.moves.length) return
    const t = setTimeout(() => setPlayed((p) => p + 1), REPLY_MS)
    return () => clearTimeout(t)
  }, [played, result, puzzle.moves.length])

  const finish = (outcome: PuzzleOutcome) => {
    setResult(outcome)
    onDone(outcome)
    send('POST', '/api/puzzles/answer', { id: puzzle.id, correct: outcome === 'solved' }).catch(() => {})
  }
  useEffect(() => {
    if (result) return playSound(result === 'missed' ? 'wrong' : 'right', durationMs('--duration-move'))
  }, [result])

  const tryMove = (from: string, to: string) => {
    if (!yourTurn) return false
    const probe = new Chess(chess.fen())
    let m
    try {
      m = probe.move({ from, to, promotion: 'q' })
    } catch {
      return false
    }
    const uci = m.from + m.to + (m.promotion ?? '')
    const expected = puzzle.moves[played]
    const isLast = played === puzzle.moves.length - 1
    // Any mate on the last move counts, as on Lichess.
    const right = uci === expected || (expected.length === 5 && uci.slice(0, 4) === expected.slice(0, 4)) || (isLast && probe.isCheckmate())
    setSelected(null)
    if (!right) {
      setHelped(true)
      setNotQuite(to)
      playSound('wrong')
      return false
    }
    setNotQuite(null)
    setHints(0)
    setPlayed((p) => p + 1)
    if (isLast) finish(helped ? 'helped' : 'solved')
    return true
  }

  const lastUci = played ? puzzle.moves[played - 1] : null
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="sky">{label}</Badge>
          <Badge variant="secondary">Rated {puzzle.rating}</Badge>
        </div>
        <h1 className="text-3xl font-bold text-balance">
          {played === 0 ? 'Watch their move…' : `Find the best move for ${me === 'white' ? 'White' : 'Black'}.`}
        </h1>
      </div>

      <LessonBoard>
        <PlayBoard
          chess={chess}
          orientation={me}
          lastMove={lastUci ? toMove(lastUci) : undefined}
          hint={result === 'missed' || (rung === 'move' && yourTurn) ? puzzle.moves[played] : null}
          glow={rung === 'piece' && yourTurn ? puzzle.moves[played].slice(0, 2) : null}
          selected={selected}
          interactive={yourTurn}
          palette={BOARDS[prefs.board]}
          flash={
            result && result !== 'missed' && lastUci
              ? { square: lastUci.slice(2, 4), tone: 'right' }
              : notQuite && yourTurn
                ? { square: notQuite, tone: 'wrong' }
                : undefined
          }
          onMove={tryMove}
          onSelect={setSelected}
        />
      </LessonBoard>

      {result ? (
        <LessonBar tone={result === 'missed' ? 'wrong' : 'right'}>
          <LessonVerdict
            tone={result === 'missed' ? 'wrong' : 'right'}
            icon={result === 'missed' ? <XIcon /> : <CheckIcon />}
            title={result === 'solved' ? 'Solved!' : result === 'helped' ? 'Solved, with help' : 'Not this time'}
            actions={
              <Button size="lg" variant={result === 'missed' ? 'danger' : 'default'} onClick={onNext}>
                {last ? 'See how it went' : 'Next puzzle'}
              </Button>
            }
          >
            <p>
              {result === 'missed'
                ? 'The green arrow shows the move. Spotting it gets easier with every one.'
                : `You found ${label.toLowerCase()}.${result === 'helped' ? ' Next time, try it without the help.' : ''}`}
            </p>
            {puzzle.url && (
              <a href={puzzle.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
                The game it comes from <ArrowSquareOutIcon className="size-3.5" />
              </a>
            )}
          </LessonVerdict>
        </LessonBar>
      ) : (
        <LessonBar tone={notQuite && !selected && !hints ? 'retry' : 'idle'}>
          <div className="flex shrink-0 gap-2">
            {hints < rungs.length && (
              <Button
                variant="outline"
                onClick={() => {
                  setHelped(true)
                  setHints((h) => h + 1)
                  setNotQuite(null)
                }}
                disabled={!yourTurn || !hintReady}
              >
                <KnIcon glyph="hint" className="size-5" />
                {rungs[hints] === 'move' ? 'Show the move' : rungs[hints] === 'piece' && hints > 0 ? 'Show the piece' : 'Hint'}
              </Button>
            )}
            <Button variant="ghost" onClick={() => finish('missed')} disabled={!yourTurn}>
              Show me
            </Button>
          </div>
          <p className={notQuite && !selected && !hints ? 'text-sm font-extrabold text-danger-text' : hints ? 'text-sm font-extrabold text-gold-text' : 'text-sm text-muted-foreground'}>
            {played === 0
              ? 'Their move first.'
              : selected
                ? 'Now pick where it goes.'
                : rung === 'tactic'
                  ? `Hint: ${tactic}`
                  : rung === 'piece'
                    ? `Hint: move the ${PIECE[chess.get(puzzle.moves[played].slice(0, 2) as never)?.type ?? 'p']} on ${puzzle.moves[played].slice(0, 2)}.`
                    : rung === 'move'
                      ? 'The arrow shows the move. Play it.'
                    : notQuite
                      ? 'Not quite. Try again, or use a hint.'
                      : 'Tap a piece, then where it goes. Or drag it.'}
          </p>
        </LessonBar>
      )}
    </>
  )
}

function Done({ results, label }: { results: PuzzleOutcome[]; label: string }) {
  const solved = results.filter((r) => r === 'solved').length
  const helped = results.filter((r) => r === 'helped').length
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div className="relative">
        {solved === results.length && <Confetti />}
        <span className="grid size-24 animate-bounce-in place-items-center rounded-full bg-gold text-on-gold shadow-[0_6px_0_var(--gold-lip)]">
          <CheckIcon className="size-12" />
        </span>
      </div>
      <div className="animate-rise [animation-delay:calc(var(--duration-celebrate)*0.4)]">
        <h1 className="text-4xl font-bold">Puzzles done</h1>
        <p className="mt-2 text-muted-foreground">
          {label}: {solved} of {results.length} solved first try{helped ? `, ${helped} with help` : ''}.
        </p>
      </div>
      <div className="flex w-full gap-1.5">
        {results.map((r, i) => (
          <span
            key={i}
            role="img"
            aria-label={`Puzzle ${i + 1}: ${r === 'helped' ? 'solved with help' : r}`}
            className={cn('h-3.5 flex-1 rounded-full', r === 'solved' ? 'bg-brand' : r === 'helped' ? 'bg-sky' : 'bg-danger')}
          />
        ))}
      </div>
      <div className="flex w-full flex-wrap justify-between gap-3 border-t-2 pt-5">
        <Button asChild size="lg" variant="outline">
          <Link to="/progress">See what you blunder</Link>
        </Button>
        <Button asChild size="lg">
          <Link to="/">Back home</Link>
        </Button>
      </div>
    </div>
  )
}
