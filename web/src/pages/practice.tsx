import { Chess } from 'chess.js'
import { Check, LoaderCircle, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Confetti } from '@/components/confetti'
import { MoveBadge } from '@/components/move-badge'
import { MarkedText } from '@/components/move-text'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { CountUp } from '@/components/ui/count-up'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { StatLabel, StatValue } from '@/components/ui/stat'
import { type DeckAnswer, type DeckCard, type DeckToday, type EngineLines, send, useApi } from '@/lib/api'
import { CLASSIFICATION } from '@/lib/classification'
import { shortDate } from '@/lib/format'
import { BOARDS, usePreferences } from '@/lib/preferences'
import { cn } from '@/lib/utils'
import { PlayBoard } from '@/pages/play'

/**
 * Today's review: positions from your own games where you went wrong, served by the deck's
 * schedule (deck.py). Find the move you missed; right answers come back later and later,
 * misses come back tomorrow.
 */
export function PracticePage() {
  const { data, error, reload } = useApi<DeckToday>('/api/deck')

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      {error && <p className="text-sm text-destructive">Couldn't load your positions. {error}</p>}
      {!data ? (
        <Skeleton className="aspect-square w-full rounded-xl" />
      ) : data.card ? (
        // Keyed by position, so the board and answer reset for each card.
        <Position key={`${data.card.game_id}-${data.card.ply}`} deck={data} card={data.card} onNext={reload} />
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

  const tryMove = (from: string, to: string) => {
    if (result) return false
    const probe = new Chess(card.fen_before)
    try {
      const m = probe.move({ from, to, promotion: 'q' })
      const uci = m.from + m.to + (m.promotion ?? '')
      setTried(uci)
      setSelected(null)
      send<DeckAnswer>('POST', '/api/deck/answer', { game_id: card.game_id, ply: card.ply, uci })
        .then(setResult)
        .catch((e: Error) => {
          setTried(null)
          setFailed(`Couldn't check that move. ${e.message}`)
        })
      return true
    } catch {
      return false
    }
  }

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
            <X />
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

      {/* As big as fits: the full width, or the window's height minus the prompt and answer. */}
      <div className="mx-auto flex w-full max-w-[calc(100svh-300px)] min-w-64">
        <PlayBoard
          chess={shown}
          orientation={card.color}
          lastMove={lastMove}
          hint={result && !result.correct ? result.best_uci : null}
          selected={selected}
          interactive={!tried}
          palette={BOARDS[prefs.board]}
          flash={result && tried ? { square: tried.slice(2, 4), tone: result.correct ? 'right' : 'wrong' } : undefined}
          onMove={tryMove}
          onSelect={setSelected}
        />
      </div>

      {failed && <p className="text-sm text-destructive">{failed}</p>}
      {result ? (
        <Verdict result={result} why={why} onNext={onNext} />
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          {tried ? 'Checking…' : selected ? 'Now pick where it goes.' : 'Tap a piece, then where it goes. Or drag it.'}
        </p>
      )}
    </>
  )
}

function Verdict({ result, why, onNext }: { result: DeckAnswer; why: string | null | undefined; onNext: () => void }) {
  const right = result.correct
  return (
    <section
      aria-live="polite"
      className={cn(
        'panel flex animate-sheet flex-col gap-3 p-5',
        right ? 'border-brand bg-brand/15' : 'border-danger bg-danger/15',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-full [animation-delay:calc(var(--duration-sheet)*0.6)]',
            right ? 'animate-bounce-in bg-brand text-on-brand' : 'animate-shake bg-danger text-on-danger',
          )}
        >
          {right ? <Check className="size-6" strokeWidth={3} /> : <X className="size-6" strokeWidth={3} />}
        </span>
        <div className="min-w-0">
          <h2 className={cn('text-2xl font-semibold', right ? 'text-brand-text' : 'text-danger-text')}>
            {right ? `Found it: ${result.best_san}` : `The move was ${result.best_san}`}
          </h2>
          <p className="mt-1">
            {why === undefined ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" /> Asking Stockfish why…
              </span>
            ) : (
              <MarkedText text={why ?? 'It keeps the position; the move you played gave it away.'} />
            )}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{nextTime(result)}</p>
        </div>
      </div>
      <Button size="lg" variant={right ? 'default' : 'danger'} className="self-end" onClick={onNext}>
        Continue
      </Button>
    </section>
  )
}

/** "Back in 3 days", "Back tomorrow", or the mastered message. */
function nextTime(result: DeckAnswer) {
  if (result.mastered) return 'Mastered: four times in a row. It won\'t come back.'
  if (!result.due) return ''
  const days = Math.round((Date.parse(result.due) - Date.parse(localToday())) / 86_400_000)
  if (days <= 1) return 'Back tomorrow.'
  if (days < 14) return `Back in ${days} days.`
  return `Back in ${Math.round(days / 7)} weeks.`
}

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function DoneForToday({ deck }: { deck: DeckToday }) {
  if (deck.total === 0) {
    return (
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-semibold">No positions yet</h1>
          <p className="text-muted-foreground">
            Positions come from your analysed games: every mistake where one move was clearly better. Run an
            update in Settings, then come back.
          </p>
        </CardHeader>
      </Card>
    )
  }
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div className="relative">
        <Confetti />
        <span className="grid size-24 animate-bounce-in place-items-center rounded-full bg-gold text-on-gold shadow-[0_6px_0_var(--gold-lip)]">
          <Check className="size-12" strokeWidth={3} />
        </span>
      </div>
      <div className="animate-rise [animation-delay:calc(var(--duration-celebrate)*0.4)]">
        <h1 className="text-4xl font-bold">Done for today</h1>
        <p className="mt-2 text-muted-foreground">
          {deck.today.done} position{deck.today.done === 1 ? '' : 's'} reviewed. The next ones come due tomorrow.
        </p>
      </div>
      <div className="grid w-full grid-cols-3 gap-4 text-left">
        <Stat label="Mastered" value={deck.mastered} order={0} />
        <Stat label="Learning" value={deck.learning} order={1} />
        <Stat label="Not seen yet" value={deck.new} order={2} />
      </div>
      <Button asChild size="lg" variant="outline">
        <Link to="/">Back to overview</Link>
      </Button>
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
