import { ArrowRightIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { EmptyState, LoadingBlock } from '@/components/empty-state'
import { ColorDot, ResultBadge } from '@/components/game-bits'
import { KnIcon } from '@/components/kn-icon'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { StatDelta, StatLabel, StatValue } from '@/components/ui/stat'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CountUpText } from '@/components/ui/count-up'
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { type DeckToday, type Home, type Kpis, type Overview, type PatternCounts, type Range, type Unit, useApi } from '@/lib/api'
import { longDate, num, openingLabel, pct, shortDate, signed } from '@/lib/format'
import { usePreferences } from '@/lib/preferences'
import { patternOf } from '@/lib/patterns'
import { unitCopy } from '@/lib/units'
import { cn } from '@/lib/utils'

const ROLLING_WINDOW = 20

export function ProgressPage() {
  const [params, setParams] = useSearchParams()
  const { prefs } = usePreferences()
  const range = (params.get('range') as Range | null) ?? prefs.overviewRange
  const { data, error } = useApi<Overview>(`/api/overview?range=${range}`)
  const { data: home } = useApi<Home>('/api/home')
  const { data: deck } = useApi<DeckToday>('/api/deck')
  const { data: blunders } = useApi<PatternCounts>(`/api/patterns?range=${range}`)

  // KPI links carry this page's range into the games list.
  const gamesLink = (extra: Record<string, string> = {}) =>
    `/games?${new URLSearchParams({ ...(range !== 'all' && { range }), ...extra })}`

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl font-bold">Progress</h1>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={0}
          value={range}
          onValueChange={(v) => v && setParams(v === prefs.overviewRange ? {} : { range: v })}
        >
          <ToggleGroupItem value="30d">30 days</ToggleGroupItem>
          <ToggleGroupItem value="90d">90 days</ToggleGroupItem>
          <ToggleGroupItem value="all">All time</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {error && <p className="text-sm text-destructive">Couldn't load your progress. {error}</p>}
      {!data ? <OverviewSkeleton /> : <OverviewBody data={data} range={range} units={home?.units} deck={deck} blunders={blunders} gamesLink={gamesLink} />}
    </div>
  )
}

/** How each unit's KPI shows on its card here: the number, its unit, a line of context,
 * and the games behind it. */
const UNIT_CARD: Record<
  Unit['id'],
  {
    value: (k: Kpis) => string
    suffix: string
    key: 'blunders_per_game' | 'conversion' | 'punish_rate' | 'comeback_rate'
    lowerIsBetter?: boolean
    context: (k: Kpis) => string
    link: { kpi: string; text: string }
  }
> = {
  blunders: {
    value: (k) => num(k.blunders_per_game, 1),
    suffix: 'blunders a game',
    key: 'blunders_per_game',
    lowerIsBetter: true,
    context: (k) => `over ${k.analysed} analysed games`,
    link: { kpi: 'blunders', text: 'Games with a blunder' },
  },
  conversion: {
    value: (k) => pct(k.conversion),
    suffix: 'conversion',
    key: 'conversion',
    context: (k) => `${k.thrown} wins thrown`,
    link: { kpi: 'thrown', text: 'Thrown wins' },
  },
  punish: {
    value: (k) => pct(k.punish_rate),
    suffix: 'punished',
    key: 'punish_rate',
    context: (k) => `of ${k.opp_blunders} blunders`,
    link: { kpi: 'unpunished', text: 'Missed chances' },
  },
  comebacks: {
    value: (k) => pct(k.comeback_rate),
    suffix: 'comebacks',
    key: 'comeback_rate',
    context: (k) => `from ${k.lost_games} losing positions`,
    link: { kpi: 'comebacks', text: 'Comebacks' },
  },
}

function OverviewBody({
  data,
  range,
  units,
  deck,
  blunders,
  gamesLink,
}: {
  data: Overview
  range: Range
  units?: Unit[]
  deck: DeckToday | null
  blunders: PatternCounts | null
  gamesLink: (extra?: Record<string, string>) => string
}) {
  const { kpis, previous_kpis: prev } = data
  const edge = kpis.opening_edge
  const accDelta = kpiDelta(kpis, prev, 'accuracy', { digits: 1 })

  return (
    <>
      <Card className="flex-row flex-wrap items-start gap-x-10 gap-y-6 px-6">
        <div className="flex min-w-44 flex-col gap-5">
          <div>
            <StatLabel>Rapid rating</StatLabel>
            <StatValue className="mt-1 text-4xl">
              <span>{data.rating.current ?? '—'}</span>
              {data.rating.change != null && <StatDelta value={data.rating.change} better={data.rating.change > 0} />}
            </StatValue>
            <Sub>Best {data.rating.best ?? '—'}</Sub>
          </div>
          <div>
            <StatLabel>Games played</StatLabel>
            <StatValue className="mt-1 text-3xl">{data.games_played}</StatValue>
            <Sub>
              About {Math.round(data.games_per_week)} a week
              {data.games_played > 0 &&
                (data.games_analysed === data.games_played ? ', all analysed' : `, ${data.games_analysed} analysed`)}
            </Sub>
          </div>
        </div>
        <RatingChart data={data} />
      </Card>

      <div className="grid items-start gap-5 md:grid-cols-2">
      {deck && deck.total > 0 && (
        <Card className="gap-4 px-6">
          <div className="flex items-center gap-3">
            <KnIcon glyph="drill" className="size-9" />
            <h2 className="font-heading text-xl font-semibold">Your review deck</h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <StatLabel>Positions</StatLabel>
              <StatValue className="mt-1 text-3xl">{deck.total}</StatValue>
            </div>
            <div>
              <StatLabel>Today</StatLabel>
              <StatValue className="mt-1 text-3xl">
                {deck.today.done}
                <span className="text-lg text-muted-foreground"> / {deck.today.total}</span>
              </StatValue>
            </div>
            <div>
              <StatLabel>Mastered</StatLabel>
              <StatValue className="mt-1 text-3xl">{deck.mastered}</StatValue>
            </div>
          </div>
          <Progress label="Mastered" value={(deck.mastered / deck.total) * 100} valueText={`${deck.mastered} of ${deck.total}`} />
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="destructive">{deck.kinds.blunder} blunders</Badge>
            <Badge variant="secondary">{deck.kinds.miss} misses</Badge>
            <Badge variant="secondary">{deck.kinds.mistake} mistakes</Badge>
            {deck.today.done < deck.today.total && (
              <Button asChild variant="outline" className="ml-auto">
                <Link to="/practice">Review positions</Link>
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Every mistake from your games where one move was clearly better. A position is mastered once you've solved it 4
            times over about two months. At most 10 a day.
          </p>
        </Card>
      )}
      {blunders && <WhatYouBlunder data={blunders} />}
      </div>

      <section aria-labelledby="units-h" className="flex flex-col gap-4">
        <div>
          <h2 id="units-h" className="text-2xl font-semibold">Your units</h2>
          <p className="mt-1 text-muted-foreground">
            Each unit is one of your numbers. Your weakest is Unit 1, and the order changes as you improve.
          </p>
        </div>
        <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {(units ?? []).map((u, i) => {
            const c = UNIT_CARD[u.id]
            const delta = kpiDelta(kpis, prev, c.key, { lowerIsBetter: c.lowerIsBetter, digits: c.key === 'blunders_per_game' ? 1 : 0, percent: c.key !== 'blunders_per_game' })
            const lead = i === 0
            return (
              <li key={u.id}>
                <Link
                  to={gamesLink({ kpi: c.link.kpi })}
                  className={cn(
                    'panel panel-link flex h-full flex-col gap-2 p-5',
                    lead && 'border-brand-lip bg-brand text-on-brand shadow-[0_4px_0_var(--brand-lip)]',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn('text-xs font-extrabold tracking-[.06em] uppercase', !lead && 'text-muted-foreground')}>
                      Unit {i + 1}
                      {lead ? ' · Now' : u.done ? ' · Done' : ''}
                    </span>
                    {!lead && !u.done && <KnIcon glyph="lock" className="size-6" />}
                    {u.done && <KnIcon glyph="check" className="size-6" />}
                  </div>
                  <h3 className="font-heading text-lg font-semibold">{u.title}</h3>
                  <p className="font-heading text-3xl font-bold">
                    <CountUpText text={c.value(kpis)} />
                    <span className={cn('font-sans text-base font-semibold', !lead && 'text-muted-foreground')}> {c.suffix}</span>
                  </p>
                  <p className="text-sm font-extrabold">
                    {delta && delta !== 'none' && delta.value !== 0 && (
                      <span className={cn(!lead && (delta.better ? 'text-brand-text' : 'text-danger-text'))}>
                        {delta.value > 0 ? '▲' : '▼'} {delta.text}{' '}
                      </span>
                    )}
                    <span className={cn('font-semibold', !lead && 'text-muted-foreground')}>
                      {lead ? `target ${unitCopy(u).target}` : c.context(kpis)}
                    </span>
                  </p>
                  {lead && (
                    <>
                      <div className="mt-1 h-3 overflow-hidden rounded-full bg-brand-lip">
                        <div className="h-full rounded-full bg-on-brand" style={{ width: `${Math.max(4, (u.check.hits / u.check.size) * 100)}%` }} />
                      </div>
                      <p className="text-[13px] font-extrabold">Unit check: {unitCopy(u).checkProgress}</p>
                    </>
                  )}
                  <span className={cn('mt-auto flex items-center gap-1 pt-1 text-xs', lead ? 'font-bold' : 'text-muted-foreground')}>
                    {c.link.text} <ArrowRightIcon className="size-3" />
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      </section>

      <div className="grid items-start gap-5 md:grid-cols-2">
        {edge != null && edge > 0 ? (
          <section aria-label="Your strength" className="flex items-center gap-4 rounded-xl border-2 border-gold-lip bg-gold p-5 text-on-gold shadow-[0_4px_0_var(--gold-lip)]">
            <span className="grid size-16 shrink-0 place-items-center rounded-full bg-card shadow-[0_3px_0_var(--gold-lip)]">
              <KnIcon glyph="star" className="size-11" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-extrabold tracking-[.06em] uppercase">Your strength</p>
              <p className="font-heading text-xl font-bold">{signed(edge / 100, 1)} out of the opening</p>
              <p className="text-sm">
                By move 10 you're ahead by about {edge >= 150 ? `${Math.round(edge / 100)} pawns` : 'a pawn'}.
                {kpis.accuracy != null && ` Accuracy ${num(kpis.accuracy, 1)}`}
                {accDelta && accDelta !== 'none' && accDelta.value !== 0 && ` (${accDelta.value > 0 ? '▲' : '▼'} ${accDelta.text})`}.
              </p>
            </div>
          </section>
        ) : (
          <StatCard label="Opening edge, eval at move 10">
            <span>{edge == null ? '—' : signed(edge / 100, 1)}</span>
            <Sub>Pawns, from your side. Positive means you leave the opening ahead.</Sub>
          </StatCard>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Top openings</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col">
            {data.top_openings.map((o) => (
              <Link
                key={`${o.eco}-${o.color}`}
                to={gamesLink({ q: o.eco, color: o.color })}
                className="flex items-center gap-3 border-b py-2 text-sm last:border-0 hover:text-foreground"
              >
                <ColorDot color={o.color} />
                <span className="min-w-0 flex-1 truncate">{openingLabel(o.opening, o.eco)}</span>
                <span className="text-muted-foreground">{o.games} games</span>
                <span className="w-10 text-right font-extrabold">{pct(o.win_rate)}</span>
              </Link>
            ))}
            {!data.top_openings.length && (
              <EmptyState compact title="No games in this period">
                {range === 'all' ? 'Sync an account in Settings to bring your games in.' : 'Try a longer range above.'}
              </EmptyState>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

/** The tactic behind your mistakes, most common first, with a tip for the top one. */
function WhatYouBlunder({ data }: { data: PatternCounts }) {
  const tactics = data.patterns.filter((p) => p.pattern !== 'other' && patternOf(p.pattern))
  const other = data.patterns.find((p) => p.pattern === 'other')
  const all = data.patterns.reduce((n, p) => n + p.total, 0) + data.pending
  const max = Math.max(1, ...tactics.map((p) => p.total))
  const top = tactics[0] && patternOf(tactics[0].pattern)
  return (
    <Card className="gap-3 px-6">
      <h2 className="font-heading text-xl font-semibold">What you blunder</h2>
      {!all ? (
        <p className="text-sm text-muted-foreground">No mistakes in this period to look at.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            The tactic behind each of your {all} blunders, mistakes and misses in this period.
          </p>
          <ul className="flex flex-col gap-2.5">
            {tactics.slice(0, 6).map((p, i) => (
              <li key={p.pattern} className="grid grid-cols-[8.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm">
                <span className={cn('truncate', i === 0 && 'font-extrabold')}>{patternOf(p.pattern)!.label}</span>
                <span className="h-3 overflow-hidden rounded-full bg-surface-muted">
                  <span
                    className={cn('block h-full rounded-full', i === 0 ? 'bg-danger' : 'bg-sky')}
                    style={{ width: `${(p.total / max) * 100}%` }}
                  />
                </span>
                <span className="text-right font-extrabold tabular-nums">{p.total}</span>
              </li>
            ))}
          </ul>
          {top && (
            <p className="rounded-md bg-danger/12 px-3 py-2 text-sm">
              <b>{top.label} first.</b> {top.tip}
            </p>
          )}
          {top && (
            <Button asChild variant="outline" className="self-start">
              <Link to={`/puzzles?theme=${tactics[0].pattern}`}>Puzzles: {top.label.toLowerCase()}</Link>
            </Button>
          )}
          <p className="text-[13px] text-muted-foreground">
            {other ? `${other.total} more had no clear tactic: slower, positional slips.` : ''}
            {data.pending ? ` ${data.pending} are waiting for the daily update to look deeper.` : ''}
          </p>
        </>
      )}
    </Card>
  )
}

function StatCard({ label, to, children }: { label: string; to?: string; children: ReactNode }) {
  const card = (
    <Card className="h-full">
      <CardHeader>
        <StatLabel>
          {label}
          {to && <ArrowRightIcon className="size-3.5" />}
        </StatLabel>
        <StatValue className="mt-1">{children}</StatValue>
      </CardHeader>
    </Card>
  )
  return to ? <Link to={to} className="panel-link rounded-xl">{card}</Link> : card
}

function Sub({ children }: { children: ReactNode }) {
  return <p className="mt-2 font-sans text-sm font-semibold text-muted-foreground">{children}</p>
}

/** null: nothing to compare (all-time view); 'none': the previous period lacks enough games. */
type DeltaInfo = { value: number; better: boolean; text: string } | 'none' | null

function kpiDelta(
  cur: Kpis,
  prev: Kpis | null,
  key: 'blunders_per_game' | 'conversion' | 'punish_rate' | 'accuracy' | 'comeback_rate',
  { lowerIsBetter = false, percent = false, digits = 0 } = {},
): DeltaInfo {
  if (!prev) return null
  const a = cur[key]
  const b = prev[key]
  if (a == null || b == null) return 'none'
  const diff = a - b
  const shown = percent ? Math.abs(diff * 100).toFixed(digits) + ' pts' : Math.abs(diff).toFixed(digits)
  if (Number(shown.split(' ')[0]) === 0) return { value: 0, better: true, text: 'no change' }
  return { value: diff, better: lowerIsBetter ? diff < 0 : diff > 0, text: shown }
}

const ratingConfig = {
  rating: { label: 'Rating', color: 'var(--muted-foreground)' },
  avg: { label: `${ROLLING_WINDOW}-game average`, color: 'var(--foreground)' },
} satisfies ChartConfig

function RatingChart({ data }: { data: Overview }) {
  const points = data.rating_series.map((p, i, all) => {
    const window = all.slice(Math.max(0, i - ROLLING_WINDOW + 1), i + 1)
    return {
      ...p,
      t: Date.parse(p.played_at),
      avg: Math.round(window.reduce((s, w) => s + w.rating, 0) / window.length),
    }
  })
  const ticks = ratingTicks(points.map((p) => p.rating))

  return (
    <figure className="flex min-w-0 flex-[1_1_26rem] flex-col gap-2">
      <figcaption className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 bg-muted-foreground/60" /> Each game
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 bg-foreground" /> {ROLLING_WINDOW}-game average
          </span>
        </div>
      </figcaption>
      <div>
        {points.length < 2 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Not enough rated games in this period.</p>
        ) : (
          <ChartContainer config={ratingConfig} className="aspect-auto h-64 w-full">
            <LineChart data={points} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(t: number) => shortDate(new Date(t).toISOString())}
                tickLine={false}
                axisLine={false}
                minTickGap={48}
              />
              <YAxis
                domain={[ticks[0], ticks[ticks.length - 1]]}
                ticks={ticks}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <ChartTooltip cursor={{ strokeDasharray: '3 3' }} content={<RatingTooltip />} />
              <Line
                dataKey="rating"
                type="linear"
                stroke="var(--color-rating)"
                strokeOpacity={0.45}
                strokeWidth={1}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                dataKey="avg"
                type="monotone"
                stroke="var(--color-avg)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        )}
      </div>
    </figure>
  )
}

/** Evenly spaced rating ticks on a round step (50/100/200...) covering every value. */
function ratingTicks(values: number[]) {
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const step = [25, 50, 100, 200, 250, 500].find((s) => (hi - lo) / s <= 5) ?? 1000
  const ticks = []
  for (let t = Math.floor(lo / step) * step; t < hi + step; t += step) ticks.push(t)
  return ticks
}

function RatingTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: Overview['rating_series'][number] & { avg: number } }[]
}) {
  const p = active && payload?.[0]?.payload
  if (!p) return null
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
      <span className="text-muted-foreground">{longDate(p.played_at)}</span>
      <span className="flex items-center gap-2">
        <ResultBadge outcome={p.outcome} />
        <span>
          vs {p.opponent} <span className="text-muted-foreground">{p.opponent_rating}</span>
        </span>
      </span>
      <span className="tabular-nums">
        Rating {p.rating} <span className="text-muted-foreground">· avg {p.avg}</span>
      </span>
    </div>
  )
}

function OverviewSkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <LoadingBlock label="Counting up your games…" className="h-80 rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    </>
  )
}
