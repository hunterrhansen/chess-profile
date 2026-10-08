import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { PhoneHeader } from '@/components/app-shell'
import { type Glyph, KnIcon } from '@/components/kn-icon'
import { LogoLoader } from '@/components/logo'
import { PathNode, type PathNodeState } from '@/components/path-node'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { StatDelta, StatLabel, StatValue } from '@/components/ui/stat'
import { type Home, type Overview, useApi } from '@/lib/api'
import { timeControl } from '@/lib/format'
import { patternOf } from '@/lib/patterns'
import { unitCopy } from '@/lib/units'
import { cn } from '@/lib/utils'

// The path zig-zags: each step sits a little left or right of the one before.
const SHIFTS = ['translate-x-0', '-translate-x-14', '-translate-x-20', '-translate-x-8', 'translate-x-8', 'translate-x-16']
const SEEN = 'knightly.unitsSeen' // finished units whose "Unit complete" banner has been shown
const SECONDS_PER_POSITION = 40

interface Step {
  key: string
  glyph: Glyph
  label: string
  tag?: string
  done: boolean
  card?: { eyebrow: string; title: string; body: string; cta: string; to: string; quiet?: boolean }
}

/**
 * Home: today's goal and your path. Unit 1 is your weakest number; its path is today's
 * lessons in order (review today's game, today's positions, then a game against the bot),
 * ending at the unit check. The current step opens a lesson card; the other units wait
 * below, re-sorting as your numbers change.
 */
export function HomePage() {
  const { data, error } = useApi<Home>('/api/home')
  const { data: overview } = useApi<Overview>('/api/overview?range=90d')
  const [open, setOpen] = useState(true)
  const [seen, setSeen] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(SEEN) ?? '[]')
    } catch {
      return []
    }
  })
  // A finished unit's banner shows once: the first time Home opens after its check passed.
  const finished = data?.units.find((u) => u.done && !seen.includes(u.id))
  useEffect(() => {
    if (!finished) return
    try {
      localStorage.setItem(SEEN, JSON.stringify([...seen, finished.id]))
    } catch {
      // shows again next time; harmless
    }
  }, [finished, seen])
  // Forget units that slipped back, so finishing one again celebrates again.
  useEffect(() => {
    if (!data) return
    const still = seen.filter((id) => data.units.some((u) => u.id === id && u.done))
    if (still.length !== seen.length) setSeen(still)
  }, [data, seen])

  if (error) return <p className="text-sm text-destructive">Couldn't load Home. {error}</p>
  if (!data) return <LogoLoader label="Laying out your path…" className="py-24" />

  const [lead, ...rest] = data.units
  const copy = unitCopy(lead)
  const { game, positions, reviewed_today, deck_total } = data.today

  const steps: Step[] = []
  if (game) {
    const today = new Date(game.played_at).toDateString() === new Date().toDateString()
    const errors = [game.blunders ? `${game.blunders} blunder${game.blunders === 1 ? '' : 's'}` : null].filter(Boolean)
    steps.push({
      key: 'review',
      glyph: 'review',
      label: game.fits_unit && !today ? copy.review : today ? "Review today's game" : 'Review your newest game',
      tag: 'New game',
      done: false,
      card: {
        eyebrow: [`vs ${game.opponent}`, timeControl(game.time_control), today ? 'today' : null].filter(Boolean).join(' · '),
        title: `Review vs ${game.opponent}`,
        body: `You ${game.outcome === 'win' ? 'won' : game.outcome === 'loss' ? 'lost' : 'drew'}${
          errors.length ? ` with ${errors.join(', ')}` : ''
        }. Walk through the key moments; afterwards your mistakes join your review deck.`,
        cta: 'Start review',
        to: `/games/${game.id}`,
      },
    })
  } else if (reviewed_today) {
    steps.push({ key: 'review', glyph: 'review', label: "Reviewed today's game", done: true })
  }
  const left = Math.max(0, positions.total - positions.done)
  if (deck_total > 0 && positions.total > 0) {
    steps.push({
      key: 'positions',
      glyph: 'drill',
      label: "Today's positions",
      tag: left ? `${left} left` : undefined,
      done: left === 0,
      card: {
        eyebrow: `Your review deck · about ${Math.max(1, Math.round((left * SECONDS_PER_POSITION) / 60))} minutes`,
        title: "Review today's positions",
        body: `${left} position${left === 1 ? '' : 's'} from your own games ${left === 1 ? 'is' : 'are'} due. Found ones come back later and later; misses come back sooner.`,
        cta: 'Start',
        to: '/practice',
      },
    })
  }
  const pz = data.today.puzzles
  const pzPattern = patternOf(pz.theme)
  if (pz.available && pz.theme && pzPattern) {
    const pzLeft = Math.max(0, pz.session - pz.done)
    steps.push({
      key: 'puzzles',
      glyph: 'goal',
      label: `Puzzles: ${pzPattern.label.toLowerCase()}`,
      tag: pzLeft ? `${pzLeft} to go` : undefined,
      done: pzLeft === 0,
      card: {
        eyebrow: `Your most common tactic · ${pz.session} puzzles`,
        title: `Puzzles: ${pzPattern.label.toLowerCase()}`,
        body: `${pzPattern.label} are behind ${pz.share != null ? `${Math.round(pz.share * 100)}% of` : 'most of'} your mistakes. These Lichess puzzles train spotting them, near your level.`,
        cta: 'Start puzzles',
        to: `/puzzles?theme=${pz.theme}`,
      },
    })
  }
  // The goal is one game reviewed and today's positions: a second new game is extra.
  const goalDone = (reviewed_today > 0 || !game) && left === 0
  steps.push({
    key: 'play',
    glyph: 'play',
    label: 'Play the bot with blunder check on',
    tag: goalDone ? 'Bonus' : undefined,
    done: false,
    card: {
      eyebrow: 'Optional · put it to work',
      title: 'Want more?',
      body: "Today's goal is done. Play the bot with blunder check on: it stops you once if a move loses a lot, so you can see what you missed.",
      cta: 'Play the bot',
      to: '/play',
      quiet: true,
    },
  })
  const current = steps.findIndex((s) => !s.done)
  const state = (i: number): PathNodeState => (i < current || steps[i].done ? 'done' : i === current ? 'current' : 'locked')
  const card = steps[current]?.card

  return (
    <div className="flex flex-wrap items-start justify-center gap-10 py-2">
      <PhoneHeader>
        <Link
          to={game ? `/games/${game.id}` : '/games?to_review=true'}
          aria-label={`Today's game: ${reviewed_today ? 'reviewed' : 'not reviewed yet'}`}
          className="flex h-11 items-center gap-1 rounded-md px-2 text-[15px] font-extrabold tabular-nums"
        >
          <KnIcon glyph="review" className="size-[26px]" />
          {reviewed_today ? 1 : 0}/1
        </Link>
        {positions.total > 0 && (
          <Link
            to="/practice"
            aria-label={`Positions to review: ${positions.done} of ${positions.total} done`}
            className="flex h-11 items-center gap-1 rounded-md px-2 text-[15px] font-extrabold tabular-nums"
          >
            <KnIcon glyph="drill" className="size-6" />
            {positions.done}/{positions.total}
          </Link>
        )}
      </PhoneHeader>
      <section aria-label="Your path" className="flex max-w-xl min-w-0 flex-[1_1_26rem] flex-col gap-6">
        {finished && (
          <div className="flex animate-bounce-in items-center gap-4 rounded-xl bg-gold px-5 py-4 text-on-gold shadow-[0_4px_0_var(--gold-lip)]">
            <KnIcon glyph="trophy" className="size-14" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold tracking-[.06em] uppercase">Unit complete</p>
              <p className="font-heading text-xl font-bold">{finished.title}</p>
              <p className="text-sm">
                {unitCopy(finished).checkResult}. You hit the target: {unitCopy(finished).target}.
              </p>
            </div>
          </div>
        )}

        <div className="rounded-xl bg-brand px-5 py-4 text-on-brand shadow-[0_4px_0_var(--brand-lip)]">
          <p className="text-[13px] font-extrabold tracking-[.06em] uppercase opacity-80">Unit 1 · Your main focus</p>
          <h1 className="mt-0.5 font-heading text-2xl font-bold">{lead.title}</h1>
          <p className="mt-1">{copy.goal}</p>
          <div className="mt-3 flex items-center gap-2.5">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-brand-lip">
              <div
                className="h-full rounded-full bg-on-brand transition-[width] duration-(--duration-fill)"
                style={{ width: `${Math.max(4, (lead.check.hits / lead.check.size) * 100)}%` }}
              />
            </div>
            <span className="text-[13px] font-extrabold">{copy.checkProgress}</span>
          </div>
        </div>

        <ol className="flex flex-col items-center gap-5 py-2">
          {steps.map((s, i) => (
            <li key={s.key} className="contents">
              <PathNode
                state={state(i)}
                glyph={s.glyph}
                label={s.label}
                tag={state(i) === 'current' ? s.tag : undefined}
                className={SHIFTS[i % SHIFTS.length]}
                expanded={i === current ? open : undefined}
                onClick={i === current && card ? () => setOpen((o) => !o) : undefined}
              />
              {i === current && card && open && (
                <Card className="-mt-1 w-full max-w-sm animate-rise gap-3 border-brand px-5 text-left shadow-[0_4px_0_var(--brand-lip)]">
                  <p className="eyebrow">{card.eyebrow}</p>
                  <h2 className="font-heading text-xl font-semibold">{card.title}</h2>
                  <p className="text-muted-foreground">{card.body}</p>
                  <Button asChild size="lg" variant={card.quiet ? 'outline' : 'default'} className="w-full">
                    <Link to={card.to}>{card.cta}</Link>
                  </Button>
                </Card>
              )}
            </li>
          ))}
          <li className="contents">
            <PathNode state="check" label={copy.checkLabel} className={SHIFTS[steps.length % SHIFTS.length]} />
          </li>
        </ol>

        {rest.map((u, i) => (
          <div key={u.id} className="flex flex-col gap-3">
            <div className="flex items-center gap-3.5 text-muted-foreground">
              <span className="h-0.5 flex-1 bg-line" />
              <span className="text-[13px] font-extrabold tracking-[.06em] uppercase">
                Unit {i + 2} · {u.title}
              </span>
              <span className="h-0.5 flex-1 bg-line" />
            </div>
            <p className="text-center text-sm text-muted-foreground">{unitCopy(u).note}</p>
            {!u.done && (
              <div className="flex justify-center gap-7 opacity-85">
                <KnIcon glyph="lock" className="size-11" />
                <KnIcon glyph="lock" className="size-11" />
                <KnIcon glyph="lock" className="size-11" />
              </div>
            )}
          </div>
        ))}
        <p className="text-center text-[13px] text-muted-foreground">Units re-sort as your numbers change: your weakest is always next.</p>
      </section>

      <aside aria-label="Today" className="flex max-w-sm min-w-0 flex-[1_1_18rem] flex-col gap-5">
        {goalDone ? (
          <Card className="items-center gap-2.5 border-gold-lip bg-gold px-5 text-center text-on-gold shadow-[0_4px_0_var(--gold-lip)]">
            <KnIcon glyph="trophy" className="size-16 animate-pop" />
            <h2 className="font-heading text-2xl font-bold">Today's goal done!</h2>
            <p className="text-sm">
              {[reviewed_today ? 'Game reviewed' : null, positions.done ? `${positions.done} positions cleared` : null]
                .filter(Boolean)
                .join(' and ') || 'Nothing due today'}
              . The next ones come due tomorrow.
            </p>
          </Card>
        ) : (
          <Card className="gap-3.5 px-5">
            <div className="flex items-center gap-3">
              <KnIcon glyph="goal" className="size-9" />
              <h2 className="font-heading text-xl font-semibold">Today's goal</h2>
            </div>
            {game || reviewed_today ? (
              <Progress
                label="Today's game"
                value={reviewed_today ? 100 : 0}
                valueText={reviewed_today ? '1 of 1' : '0 of 1'}
              />
            ) : (
              <div className="flex items-center justify-between text-sm">
                <span className="font-extrabold">No new game today</span>
                <Link to="/play" className="font-extrabold text-brand-text hover:underline">
                  Play one
                </Link>
              </div>
            )}
            {positions.total > 0 && (
              <>
                <Progress
                  label="Positions to review"
                  tone="sky"
                  value={(positions.done / positions.total) * 100}
                  valueText={`${positions.done} of ${positions.total}`}
                />
                {left > 0 && (
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/practice">Review positions</Link>
                  </Button>
                )}
              </>
            )}
            <p className="text-[13px] text-muted-foreground">Found ones come back later and later. Misses come back sooner.</p>
          </Card>
        )}

        {overview?.rating.current != null && (
          <Card className="gap-1 px-5">
            <StatLabel>Rapid rating</StatLabel>
            <StatValue className={cn('text-3xl')}>{overview.rating.current}</StatValue>
            {overview.rating.change != null && (
              <span className="text-sm">
                <StatDelta value={overview.rating.change} better={overview.rating.change > 0} /> in 90 days
              </span>
            )}
          </Card>
        )}
      </aside>
    </div>
  )
}
