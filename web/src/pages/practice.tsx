import { Chess } from 'chess.js'
import { CheckIcon, CircleNotchIcon, XIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Confetti } from '@/components/confetti'
import { LessonBar, LessonBoard, LessonScreen, LessonVerdict } from '@/components/lesson-bar'
import { EmptyState, LoadingBlock } from '@/components/empty-state'
import { MoveBadge } from '@/components/move-badge'
import { MarkedText } from '@/components/move-text'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { CountUp } from '@/components/ui/count-up'
import { Progress } from '@/components/ui/progress'
import { StatLabel, StatValue } from '@/components/ui/stat'
import { type DeckAnswer, type DeckCard, type DeckToday, type EngineLines, send, useApi } from '@/lib/api'
import { CLASSIFICATION } from '@/lib/classification'
import { nextTime, shortDate } from '@/lib/format'
import { moveLabel } from '@/lib/key-moments'
import { PATTERNS, patternOf } from '@/lib/patterns'
import { BOARDS, usePreferences } from '@/lib/preferences'
import { durationMs } from '@/lib/motion'
import { playSound } from '@/lib/sound'
import { cn } from '@/lib/utils'
import { PlayBoard } from '@/pages/play'

/**
 * Today's review: positions from your own games where you went wrong, served by the deck's
 * schedule (deck.py). Find the move you missed; right answers come back later and later,
 * misses come back tomorrow.
 */
export function PracticePage() {
  const { data, error, reload } = useApi<DeckToday>('/api/deck')

  const failed = error && <p className="text-sm text-destructive">Couldn't load your positions. {error}</p>
  // A position is a lesson screen: one window high, the answer bar along the bottom.
  if (data?.card) {
    return (
      <LessonScreen>
        {failed}
        {/* Keyed by position, so the board and answer reset for each card. */}
        <Position key={`${data.card.game_id}-${data.card.ply}`} deck={data} card={data.card} onNext={reload} />
      </LessonScreen>
    )
  }
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      {failed}
      {!data ? (
        <LoadingBlock label="Picking today's positions…" className="aspect-square w-full rounded-xl" />
      ) : (
        <DoneForToday deck={data} />
      )}
    </div>
  )
}

function Position({ deck, card, onNext }: { deck: DeckToday; card: DeckCard; onNext: () => void }) {
  const { prefs } = usePreferences()
  const chess = useMemo(() => new Chess(card.fen_before), [card.fen_before])
  const [selected, setSelected] = useState<string | null>(null)
  const [tried, setTried] = useState<string | null>(null) // your answer, as UCI
  const [result, setResult] = useState<DeckAnswer | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [why, setWhy] = useState<string | null | undefined>(undefined) // undefined: loading

  // The verdict's sound lands with the square's flash, after the piece.
  useEffect(() => {
    if (result) return playSound(result.correct ? 'right' : 'wrong', durationMs('--duration-move'))
  }, [result])

  // Once answered, ask for the engine's explanation of the best line (cached after the
  // first time, the same "Best line" game review shows).
  useEffect(() => {
    if (!result) return
    let live = true
    fetch(`/api/games/${card.game_id}/lines/${card.ply}`)
      .then((r) => (r.ok ? (r.json() as Promise<EngineLines>) : null))
      .then((lines) => live && setWhy(lines?.best?.summary ?? null))
      .catch(() => live && setWhy(null))
    return () => {
      live = false
    }
  }, [result, card.game_id, card.ply])

  const submit = (uci: string) => {
    setTried(uci)
    setSelected(null)
    send<DeckAnswer>('POST', '/api/deck/answer', { game_id: card.game_id, ply: card.ply, uci })
      .then(setResult)
      .catch((e: Error) => {
        setTried(null)
        setFailed(`Couldn't check that move. ${e.message}`)
      })
  }
  const tryMove = (from: string, to: string) => {
    if (result) return false
    const probe = new Chess(card.fen_before)
    try {
      const m = probe.move({ from, to, promotion: 'q' })
      submit(m.from + m.to + (m.promotion ?? ''))
      return true
    } catch {
      return false
    }
  }
  // Skip: a miss, so it comes back tomorrow; the null move "0000" tells the server.
  const skipped = tried === SKIP

  // The board shows your answer once it's checked: the move itself when right, the engine's
  // move as an arrow when not.
  const shown = useMemo(() => {
    if (!result?.correct || !tried) return chess
    const after = new Chess(card.fen_before)
    after.move({ from: tried.slice(0, 2), to: tried.slice(2, 4), promotion: tried[4] })
    return after
  }, [result, tried, chess, card.fen_before])
  const lastMove = result?.correct && tried
    ? { from: tried.slice(0, 2), to: tried.slice(2, 4) }
    : card.prev_uci ? { from: card.prev_uci.slice(0, 2), to: card.prev_uci.slice(2, 4) } : undefined

  const doneToday = deck.today.done + (result ? 1 : 0)
  const kind = CLASSIFICATION[card.classification]

  return (
    <>
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Stop for now">
          <Link to="/">
            <XIcon />
          </Link>
        </Button>
        <Progress
          className="flex-1"
          label="Today's positions"
          hideLabel
          value={(doneToday / Math.max(1, deck.today.total)) * 100}
        />
        <span key={doneToday} className="animate-bump text-sm font-extrabold tabular-nums">
          {doneToday} of {deck.today.total}
        </span>
      </header>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {card.reviews === 0 && <Badge variant="sky">New</Badge>}
          <Badge variant="secondary">
            vs {card.opponent ?? 'opponent'} · {shortDate(card.played_at)} · move {card.move_number}
          </Badge>
          <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: kind.color }}>
            <MoveBadge kind={card.classification} />
            {kind.label}
          </span>
        </div>
        <h1 className="text-3xl font-bold text-balance">
          You played {card.san} here. Find a better move.
        </h1>
        <p className="text-muted-foreground">
          {card.color === 'white' ? 'White' : 'Black'} to move
          {card.win_pct_before != null && `. Your winning chance was ${Math.round(card.win_pct_before)}%.`}
        </p>
      </div>

      <LessonBoard>
        <PlayBoard
          chess={shown}
          orientation={card.color}
          lastMove={lastMove}
          hint={result && !result.correct ? result.best_uci : null}
          selected={selected}
          interactive={!tried}
          palette={BOARDS[prefs.board]}
          flash={result && tried && !skipped ? { square: tried.slice(2, 4), tone: result.correct ? 'right' : 'wrong' } : undefined}
          onMove={tryMove}
          onSelect={setSelected}
        />
      </LessonBoard>

      {failed && <p className="text-sm text-destructive">{failed}</p>}
      {result ? (
        <Verdict result={result} why={why} tactic={card.pattern} onNext={onNext} />
      ) : (
        <LessonBar tone="idle">
          <Button variant="outline" onClick={() => submit(SKIP)} disabled={!!tried} className="self-start md:self-auto">
            Skip
          </Button>
          <p className="text-sm text-muted-foreground">
            {tried ? 'Checking…' : selected ? 'Now pick where it goes.' : 'Tap a piece, then where it goes. Or drag it.'}
          </p>
        </LessonBar>
      )}
    </>
  )
}

const SKIP = '0000'

function Verdict({
  result,
  why,
  tactic,
  onNext,
}: {
  result: DeckAnswer
  why: string | null | undefined
  /** The tactic behind the position, said only once you've answered. */
  tactic: string | null
  onNext: () => void
}) {
  const right = result.correct
  const pattern = patternOf(tactic)
  return (
    <LessonBar tone={right ? 'right' : 'wrong'}>
      <LessonVerdict
        tone={right ? 'right' : 'wrong'}
        icon={right ? <CheckIcon /> : <XIcon />}
        title={right ? `Found it: ${result.best_san}` : `The move was ${result.best_san}`}
        actions={
          <Button size="lg" variant={right ? 'default' : 'danger'} onClick={onNext}>
            Continue
          </Button>
        }
      >
        <p>
          {why === undefined ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <CircleNotchIcon className="size-4 animate-spin" /> Asking Stockfish why…
            </span>
          ) : (
            <MarkedText text={why ?? 'It keeps the position; the move you played gave it away.'} />
          )}
        </p>
        {pattern && pattern.label !== PATTERNS.other.label && (
          <p className="mt-1 text-sm">
            <span className="font-extrabold">{pattern.one}.</span> {pattern.tip}
          </p>
        )}
        <p className="mt-0.5 text-[13px] text-muted-foreground">{nextTime(result)}</p>
      </LessonVerdict>
    </LessonBar>
  )
}

function DoneForToday({ deck }: { deck: DeckToday }) {
  if (deck.total === 0) {
    return (
      <Card>
        <EmptyState
          title="No positions yet"
          action={
            <Button asChild>
              <Link to="/settings">Go to Settings</Link>
            </Button>
          }
        >
          Positions come from your analysed games: every mistake where one move was clearly better. Run an update
          in Settings, then come back.
        </EmptyState>
      </Card>
    )
  }
  const results = deck.results
  const right = results.filter((r) => r.correct).length
  const misses = results.filter((r) => !r.correct)
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div className="relative">
        <Confetti />
        <span className="grid size-24 animate-bounce-in place-items-center rounded-full bg-gold text-on-gold shadow-[0_6px_0_var(--gold-lip)]">
          <CheckIcon className="size-12" />
        </span>
      </div>
      <div className="animate-rise [animation-delay:calc(var(--duration-celebrate)*0.4)]">
        <h1 className="text-4xl font-bold">Done for today</h1>
        <p className="mt-2 text-muted-foreground">
          {deck.today.done} position{deck.today.done === 1 ? '' : 's'} reviewed.
          {results.length > 0 &&
            ` ${right} right${misses.length ? `, ${misses.length} back tomorrow` : ''}.`}
        </p>
      </div>
      {results.length > 0 && (
        <Card className="w-full animate-rise gap-2.5 px-5 text-left [animation-delay:calc(var(--duration-celebrate)*0.45)]">
          <p className="eyebrow">Today, one by one</p>
          <div className="flex gap-1.5">
            {results.map((r, i) => (
              <span
                key={i}
                role="img"
                aria-label={`Position ${i + 1}: ${r.correct ? 'right' : 'back tomorrow'}`}
                className={cn('h-3.5 flex-1 rounded-full', r.correct ? 'bg-brand' : 'bg-danger')}
              />
            ))}
          </div>
          {misses.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Misses:{' '}
              {misses.map((r) => `${moveLabel(r.ply, r.san)}${r.opponent ? ` vs ${r.opponent}` : ''}`).join(', ')}.
            </p>
          )}
        </Card>
      )}
      <div className="grid w-full grid-cols-3 gap-4 text-left">
        <Stat label="Mastered" value={deck.mastered} order={0} />
        <Stat label="Learning" value={deck.learning} order={1} />
        <Stat label="Not seen yet" value={deck.new} order={2} />
      </div>
      <p className="-mt-2 text-sm text-muted-foreground">A position is mastered after 4 right in a row, over about two months.</p>
      <div className="flex w-full flex-wrap justify-between gap-3 border-t-2 pt-5">
        <Button asChild size="lg" variant="outline">
          <Link to="/progress">See your deck</Link>
        </Button>
        <Button asChild size="lg">
          <Link to="/">Back home</Link>
        </Button>
      </div>
    </div>
  )
}

/** A stat tile that rises in after the ones before it (`order`) and counts up. */
function Stat({ label, value, order }: { label: string; value: number; order: number }) {
  return (
    <Card size="sm" className="animate-rise" style={{ animationDelay: `calc(var(--duration-celebrate) * 0.5 + ${order} * 80ms)` }}>
      <CardHeader>
        <StatLabel>{label}</StatLabel>
        <StatValue className="mt-1 text-3xl">
          <CountUp value={value} />
        </StatValue>
      </CardHeader>
    </Card>
  )
}
