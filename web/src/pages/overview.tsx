import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { EmptyState, LoadingBlock } from '@/components/empty-state'
import { ColorDot, ResultBadge } from '@/components/game-bits'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { StatDelta, StatLabel, StatValue } from '@/components/ui/stat'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CountUpText } from '@/components/ui/count-up'
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { type KpiPoint, type Kpis, type Overview, type Range, useApi } from '@/lib/api'
import { longDate, num, openingLabel, pct, RANGE_LABEL, shortDate, signed } from '@/lib/format'
import { usePreferences } from '@/lib/preferences'
import { cn } from '@/lib/utils'

const ROLLING_WINDOW = 20

export function OverviewPage() {
  const [params, setParams] = useSearchParams()
  const { prefs } = usePreferences()
  const range = (params.get('range') as Range | null) ?? prefs.overviewRange
  const { data, error } = useApi<Overview>(`/api/overview?range=${range}`)

  // KPI links carry the overview's range into the games list.
  const gamesLink = (extra: Record<string, string> = {}) =>
    `/games?${new URLSearchParams({ ...(range !== 'all' && { range }), ...extra })}`

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-medium">Overview</h1>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={range}
          onValueChange={(v) => v && setParams(v === prefs.overviewRange ? {} : { range: v })}
        >
          <ToggleGroupItem value="30d">30d</ToggleGroupItem>
          <ToggleGroupItem value="90d">90d</ToggleGroupItem>
          <ToggleGroupItem value="all">All</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {error && <p className="text-sm text-destructive">Couldn't load the overview. {error}</p>}
      {!data ? <OverviewSkeleton /> : <OverviewBody data={data} range={range} gamesLink={gamesLink} />}
    </div>
  )
}

function OverviewBody({
  data,
  range,
  gamesLink,
}: {
  data: Overview
  range: Range
  gamesLink: (extra?: Record<string, string>) => string
}) {
  const { kpis, previous_kpis: prev, kpi_series: series } = data
  const analysedShare = data.games_played ? data.games_analysed / data.games_played : 0
  const vs = range === 'all' ? null : `vs previous ${RANGE_LABEL[range]}`

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Rapid rating">
          <span>{data.rating.current ?? '—'}</span>
          {data.rating.change != null && <StatDelta value={data.rating.change} better={data.rating.change > 0} />}
          <Sub>Best {data.rating.best ?? '—'}</Sub>
        </StatCard>
        <StatCard label="Games played">
          <span>{data.games_played}</span>
          <Sub>~{Math.round(data.games_per_week)} per week</Sub>
        </StatCard>
        <StatCard label="Games analysed" to={gamesLink({ kpi: 'analysed' })}>
          <span>{data.games_analysed}</span>
          <Sub>{pct(analysedShare)} of rated games</Sub>
          <Progress value={analysedShare * 100} label="Share of rated games analysed" hideLabel size="sm" className="mt-3" />
        </StatCard>
      </div>

      <RatingChart data={data} />

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-medium">Improvement KPIs</h2>
          <span className="text-xs text-muted-foreground">
            Engine KPIs use the {kpis.analysed} analysed games{vs && `, ${vs}`}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Blunders per game"
            focus
            value={num(kpis.blunders_per_game, 1)}
            delta={kpiDelta(kpis, prev, 'blunders_per_game', { lowerIsBetter: true, digits: 1 })}
            series={series}
            seriesKey="blunders_per_game"
            link={{ to: gamesLink({ kpi: 'blunders' }), text: 'Games with a blunder' }}
          />
          <KpiCard
            label="Win conversion"
            value={pct(kpis.conversion)}
            sub={`${kpis.winning_games} winning positions`}
            delta={kpiDelta(kpis, prev, 'conversion', { percent: true })}
            series={series}
            seriesKey="conversion"
            link={{ to: gamesLink({ kpi: 'thrown' }), text: `${kpis.thrown} thrown wins` }}
          />
          <KpiCard
            label="Punish rate"
            value={pct(kpis.punish_rate)}
            sub={`${kpis.opp_blunders} opponent blunders`}
            delta={kpiDelta(kpis, prev, 'punish_rate', { percent: true })}
            series={series}
            seriesKey="punish_rate"
            link={{ to: gamesLink({ kpi: 'unpunished' }), text: 'Games with missed chances' }}
          />
          <KpiCard
            label="Accuracy"
            value={kpis.accuracy == null ? '—' : `${num(kpis.accuracy, 1)}%`}
            sub="Engine-analysed games"
            delta={kpiDelta(kpis, prev, 'accuracy', { digits: 1 })}
            series={series}
            seriesKey="accuracy"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Opening edge, eval at move 10">
            <span>{kpis.opening_edge == null ? '—' : signed(kpis.opening_edge / 100, 1)}</span>
            <Sub>Pawns, from your side. Positive means you leave the opening ahead.</Sub>
          </StatCard>
          <StatCard label="Comeback rate" to={gamesLink({ kpi: 'comebacks' })}>
            <span>{pct(kpis.comeback_rate)}</span>
            <Sub>Drawn or won from {kpis.lost_games} losing positions</Sub>
          </StatCard>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Recent games</CardTitle>
            <Link to={gamesLink()} className="text-sm text-muted-foreground hover:text-foreground">
              View all
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col">
            {data.recent_games.map((g) => (
              <Link
                key={g.id}
                to={`/games/${g.id}`}
                className="flex items-center gap-3 border-b py-2 text-sm last:border-0 hover:text-foreground"
              >
                <ResultBadge outcome={g.outcome} />
                <ColorDot color={g.color} />
                <span className="min-w-0 flex-1 truncate">
                  {g.opponent} <span className="text-muted-foreground">{g.opponent_rating}</span>
                </span>
                <span className="text-muted-foreground">{g.ended_by}</span>
                <span className="w-14 text-right text-muted-foreground">{shortDate(g.played_at)}</span>
              </Link>
            ))}
            {!data.recent_games.length && (
              <EmptyState compact title="No games in this period">
                {range === 'all' ? 'Sync an account in Settings to bring your games in.' : 'Try a longer range above.'}
              </EmptyState>
            )}
          </CardContent>
        </Card>
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
                <span className="w-10 text-right font-medium">{pct(o.win_rate)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function StatCard({ label, to, children }: { label: string; to?: string; children: ReactNode }) {
  const card = (
    <Card className="h-full">
      <CardHeader>
        <StatLabel>
          {label}
          {to && <ArrowRight className="size-3.5" />}
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
  key: 'blunders_per_game' | 'conversion' | 'punish_rate' | 'accuracy',
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

function KpiCard({
  label,
  value,
  sub,
  delta,
  series,
  seriesKey,
  link,
  focus,
}: {
  label: string
  value: string
  sub?: string
  delta: DeltaInfo
  series: KpiPoint[]
  seriesKey: keyof Omit<KpiPoint, 'period'>
  link?: { to: string; text: string }
  focus?: boolean
}) {
  return (
    <Card className={cn('gap-2', focus && 'border-danger')}>
      <CardHeader>
        {focus && <Badge variant="destructive" className="mb-1">Main focus</Badge>}
        <StatLabel>{label}</StatLabel>
        <StatValue className="mt-1 text-3xl">
          <CountUpText text={value} />
          {delta === 'none' ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">no earlier data</span>
          ) : delta?.value === 0 ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">no change</span>
          ) : (
            delta && <StatDelta value={delta.value} better={delta.better} text={delta.text} />
          )}
        </StatValue>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-end gap-2">
        <Sparkline series={series} dataKey={seriesKey} />
        {link && (
          <Link
            to={link.to}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {link.text} <ArrowRight className="size-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

const sparkConfig = { v: { label: 'Value', color: 'var(--foreground)' } } satisfies ChartConfig

function Sparkline({ series, dataKey }: { series: KpiPoint[]; dataKey: string }) {
  if (series.filter((p) => p[dataKey as keyof KpiPoint] != null).length < 2) {
    return <div className="h-10" />
  }
  return (
    <ChartContainer config={sparkConfig} className="aspect-auto h-10 w-full">
      <LineChart data={series} margin={{ top: 4, bottom: 4, left: 2, right: 2 }}>
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Line
          dataKey={dataKey}
          type="monotone"
          stroke="var(--color-v)"
          strokeOpacity={0.6}
          strokeWidth={1.5}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  )
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
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Rating trend</CardTitle>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 bg-muted-foreground/60" /> Each game
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 bg-foreground" /> {ROLLING_WINDOW}-game average
          </span>
        </div>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
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
