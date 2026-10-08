import { CheckIcon, CircleNotchIcon, XIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Confetti } from '@/components/confetti'
import { FindBar } from '@/components/find-bar'
import { LessonBoard, LessonScreen } from '@/components/lesson-bar'
import { EmptyState, LoadingBlock } from '@/components/empty-state'
import { MoveBadge } from '@/components/move-badge'
import { MarkedText } from '@/components/move-text'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { CountUp } from '@/components/ui/count-up'
import { Progress } from '@/components/ui/progress'
import { StatLabel, StatValue } from '@/components/ui/stat'
import { type DeckCard, type DeckToday, type EngineLines, type PracticeMark, useApi } from '@/lib/api'
import { CLASSIFICATION } from '@/lib/classification'
import { nextTime, shortDate } from '@/lib/format'
import { type FindOutcome, useFindMove } from '@/lib/find-move'
import { moveLabel } from '@/lib/key-moments'
import { PATTERNS, patternOf } from '@/lib/patterns'
import { BOARDS, usePreferences } from '@/lib/preferences'
import { cn } from '@/lib/utils'
import { PlayBoard } from '@/pages/play'

/**
 * Today's review: positions from your own games where you went wrong, served by the deck's
 * schedule (deck.py: FSRS, graded like Anki from your first try). Find the move you missed;
 * a wrong move slides back so you can try again, Hint helps, and anything you didn't get
 * first time comes back once more at the end of the session (Duolingo's redo).
 */
export function PracticePage() {
  const { data, error, reload } = useApi<DeckToday>('/api/deck')
  // Positions to go over again before the session ends, in the order you missed them.
  const [again, setAgain] = useState<DeckCard[]>([])

  const failed = error && <p className="text-sm text-destructive">Couldn't load your positions. {error}</p>
  const card = data?.card ?? null
  const redo = !card && again.length > 0 ? again[0] : null
  // A position is a lesson screen: one window high, the answer bar along the bottom.
  if (data && (card || redo)) {
    const current = (card ?? redo)!
    return (
      <LessonScreen>
        {failed}
        {/* Keyed by position (and pass), so the board and answer reset each time. */}
        <Position
          key={`${current.game_id}-${current.ply}-${redo ? 'again' : 'first'}`}
          deck={data}
          card={current}
          redo={!!redo}
          againLeft={again.length}
          onNext={(outcome) => {
            if (redo) setAgain((a) => a.slice(1))
            else {
              if (outcome === 'helped' || outcome === 'shown') setAgain((a) => [...a, current])
              reload()
            }
          }}
        />
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

function Position({
  deck,
  card,
  redo,
  againLeft,
  onNext,
}: {
  deck: DeckToday
  card: DeckCard
  redo: boolean
  againLeft: number
  onNext: (outcome: FindOutcome) => void
}) {
  const { prefs } = usePreferences()
  const find = useFindMove({ gameId: card.game_id, ply: card.ply, fen: card.fen_before, redo })
  const [why, setWhy] = useState<string | null | undefined>(undefined) // undefined: loading

  // Once it's over, ask for the engine's explanation of the best line (cached after the
  // first time, the same "Best line" game review shows).
  const over = !!find.outcome
  useEffect(() => {
    if (!over) return
    let live = true
    fetch(`/api/games/${card.game_id}/lines/${card.ply}`)
      .then((r) => (r.ok ? (r.json() as Promise<EngineLines>) : null))
      .then((lines) => live && setWhy(lines?.best?.summary ?? null))
      .catch(() => live && setWhy(null))
    return () => {
      live = false
    }
  }, [over, card.game_id, card.ply])

  const doneToday = redo ? deck.today.done : deck.today.done + (find.first ? 1 : 0)
  const kind = CLASSIFICATION[card.classification]
  const pattern = patternOf(card.pattern)
  const lastMove = find.board.lastMove ?? (card.prev_uci ? { from: card.prev_uci.slice(0, 2), to: card.prev_uci.slice(2, 4) } : undefined)
  const missed = find.outcome === 'helped' || find.outcome === 'shown'
  const when = !find.first
    ? null
    : redo
      ? `That one was for learning. ${nextTime(find.first)}`
      : missed
        ? `One more go at the end of this session. Then ${nextTime(find.first).toLowerCase()}`
        : nextTime(find.first)

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
          {redo && ` · ${againLeft} again`}
        </span>
      </header>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {redo ? <Badge variant="sky">One more go</Badge> : card.reviews === 0 && <Badge variant="sky">New</Badge>}
          <Badge variant="secondary">
            vs {card.opponent ?? 'opponent'} · {shortDate(card.played_at)} · move {card.move_number}
          </Badge>
          <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: kind.color }}>
            <MoveBadge kind={card.classification} />
            {kind.label}
          </span>
        </div>
        <h1 className="text-3xl font-bold text-balance">
          {redo ? 'You missed this one earlier. Find the move again.' : `You played ${card.san} here. Find a better move.`}
        </h1>
        <p className="text-muted-foreground">
          {card.color === 'white' ? 'White' : 'Black'} to move
          {card.win_pct_before != null && `. Your winning chance was ${Math.round(card.win_pct_before)}%.`}
        </p>
      </div>

      <LessonBoard>
        <PlayBoard
          chess={find.shown}
          orientation={card.color}
          lastMove={lastMove}
          hint={find.board.hint}
          glow={find.board.glow}
          selected={find.selected}
          interactive={find.board.interactive}
          palette={BOARDS[prefs.board]}
          flash={find.board.flash}
          onMove={find.tryMove}
          onSelect={find.setSelected}
        />
      </LessonBoard>

      <FindBar find={find} when={when} onNext={() => onNext(find.outcome!)}>
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
      </FindBar>
    </>
  )
}

// The marks on Done for today: found, a good move, found with help, missed.
const MARK: Record<PracticeMark, { label: string; className: string }> = {
  found: { label: 'found', className: 'bg-brand' },
  good: { label: 'a good move', className: 'bg-[color-mix(in_srgb,var(--brand)_50%,var(--card))]' },
  helped: { label: 'found with help', className: 'bg-sky' },
  missed: { label: 'missed', className: 'bg-danger' },
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
  const count = (m: PracticeMark) => results.filter((r) => r.mark === m).length
  const misses = results.filter((r) => r.mark === 'missed' || r.mark === 'helped')
  const summary = (
    [
      [count('found') + count('good'), 'found'],
      [count('helped'), 'with help'],
      [count('missed'), 'missed'],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(', ')
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
          {results.length > 0 && ` ${summary}.`}
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
                aria-label={`Position ${i + 1}: ${MARK[r.mark].label}`}
                className={cn('h-3.5 flex-1 rounded-full', MARK[r.mark].className)}
              />
            ))}
          </div>
          {misses.length > 0 && (
            <p className="text-sm text-muted-foreground">
              To go over again:{' '}
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
      <p className="-mt-2 text-sm text-muted-foreground">Mastered: you're expected to still know it two months from now. It still comes back, just rarely.</p>
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
