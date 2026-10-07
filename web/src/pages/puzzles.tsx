import { Chess } from 'chess.js'
import { ArrowSquareOutIcon, CheckIcon, XIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Confetti } from '@/components/confetti'
import { EmptyState, LoadingBlock } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { type Puzzle, type PuzzleNext, send } from '@/lib/api'
import { durationMs } from '@/lib/motion'
import { patternOf } from '@/lib/patterns'
import { BOARDS, usePreferences } from '@/lib/preferences'
import { playSound } from '@/lib/sound'
import { cn } from '@/lib/utils'
import { PlayBoard } from '@/pages/play'

const REPLY_MS = 600 // the opponent's moves in a puzzle, after yours

const toMove = (uci: string) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })

/**
 * Puzzles for the tactic behind most of your mistakes (?theme=hangingPiece), from the
 * Lichess puzzle database. A lesson like Practice: full screen, a set of SESSION puzzles,
 * then a summary. A wrong move ends the puzzle (it counts as a miss) and shows the answer.
 */
export function PuzzlesPage() {
  const [params] = useSearchParams()
  const theme = params.get('theme') ?? 'hangingPiece'
  const pattern = patternOf(theme)
  const [next, setNext] = useState<PuzzleNext | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<boolean[]>([])

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

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
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
          onDone={(solved) => setResults((r) => [...r, solved])}
          onNext={load}
          last={results.length + 1 >= session}
        />
      )}
    </div>
  )
}

function PuzzleBoard({
  puzzle,
  label,
  onDone,
  onNext,
  last,
}: {
  puzzle: Puzzle
  label: string
  onDone: (solved: boolean) => void
  onNext: () => void
  last: boolean
}) {
  const { prefs } = usePreferences()
  const [played, setPlayed] = useState(0) // how many of puzzle.moves are on the board
  const [selected, setSelected] = useState<string | null>(null)
  const [result, setResult] = useState<'solved' | 'missed' | null>(null)

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

  const finish = (solved: boolean) => {
    setResult(solved ? 'solved' : 'missed')
    onDone(solved)
    send('POST', '/api/puzzles/answer', { id: puzzle.id, correct: solved }).catch(() => {})
  }
  useEffect(() => {
    if (result) return playSound(result === 'solved' ? 'right' : 'wrong', durationMs('--duration-move'))
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
      finish(false)
      return false
    }
    setPlayed((p) => p + 1)
    if (isLast) finish(true)
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

      <div className="mx-auto flex w-full max-w-[calc(100svh-300px)] min-w-64">
        <PlayBoard
          chess={chess}
          orientation={me}
          lastMove={lastUci ? toMove(lastUci) : undefined}
          hint={result === 'missed' ? puzzle.moves[played] : null}
          selected={selected}
          interactive={yourTurn}
          palette={BOARDS[prefs.board]}
          flash={result === 'solved' && lastUci ? { square: lastUci.slice(2, 4), tone: 'right' } : undefined}
          onMove={tryMove}
          onSelect={setSelected}
        />
      </div>

      {result ? (
        <section
          aria-live="polite"
          className={cn(
            'panel flex animate-sheet flex-col gap-3 p-5',
            result === 'solved' ? 'border-brand bg-brand/15' : 'border-danger bg-danger/15',
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                'grid size-10 shrink-0 place-items-center rounded-full [animation-delay:calc(var(--duration-sheet)*0.6)]',
                result === 'solved' ? 'animate-bounce-in bg-brand text-on-brand' : 'animate-shake bg-danger text-on-danger',
              )}
            >
              {result === 'solved' ? <CheckIcon className="size-6" /> : <XIcon className="size-6" />}
            </span>
            <div className="min-w-0">
              <h2 className={cn('text-2xl font-semibold', result === 'solved' ? 'text-brand-text' : 'text-danger-text')}>
                {result === 'solved' ? 'Solved!' : 'Not this time'}
              </h2>
              <p className="mt-1">{result === 'solved' ? `You found ${label.toLowerCase()}.` : 'The green arrow shows the move. Spotting it gets easier with every one.'}</p>
              {puzzle.url && (
                <a href={puzzle.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  The game it comes from <ArrowSquareOutIcon className="size-3.5" />
                </a>
              )}
            </div>
          </div>
          <Button size="lg" variant={result === 'solved' ? 'default' : 'danger'} className="self-end" onClick={onNext}>
            {last ? 'See how it went' : 'Next puzzle'}
          </Button>
        </section>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          {played === 0 ? 'Their move first.' : selected ? 'Now pick where it goes.' : 'Tap a piece, then where it goes. Or drag it.'}
        </p>
      )}
    </>
  )
}

function Done({ results, label }: { results: boolean[]; label: string }) {
  const solved = results.filter(Boolean).length
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
          {label}: {solved} of {results.length} solved.
        </p>
      </div>
      <div className="flex w-full gap-1.5">
        {results.map((r, i) => (
          <span
            key={i}
            role="img"
            aria-label={`Puzzle ${i + 1}: ${r ? 'solved' : 'missed'}`}
            className={cn('h-3.5 flex-1 rounded-full', r ? 'bg-brand' : 'bg-danger')}
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
