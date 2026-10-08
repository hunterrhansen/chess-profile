import { CaretLeftIcon, CaretRightIcon, FunnelIcon, MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react'
import { CheckIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { EmptyState } from '@/components/empty-state'
import { ColorDot, ResultBadge } from '@/components/game-bits'
import { MoveBadge } from '@/components/move-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { type Game, type GamesPage as GamesResponse, useApi } from '@/lib/api'
import { num, openingLabel, RANGE_LABEL, timeControl } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Filters live in the URL so Progress KPIs can link straight to a filtered list. Search and
 * these narrow the whole list; the quick filters pick within it. */
const FILTERS = {
  speed: { label: 'Speed', options: { rapid: 'Rapid', daily: 'Daily' }, any: 'All' },
  color: { label: 'Color', options: { white: 'White', black: 'Black' }, any: 'Both' },
  range: { label: 'Date range', options: { '30d': '30d', '90d': '90d' }, any: 'All' },
} as const
type FilterKey = keyof typeof FILTERS
const TOGGLES = { analysed: 'Analysed only', unrated: 'Include unrated' } as const
type ToggleKey = keyof typeof TOGGLES

/** The pills on top: each sets its own URL params and clears the others'. */
const QUICK = [
  { id: 'all', label: 'All', params: {}, count: 'all' },
  { id: 'review', label: 'To review', params: { to_review: 'true' }, count: 'to_review' },
  { id: 'wins', label: 'Wins', params: { result: 'win' }, count: 'wins' },
  { id: 'losses', label: 'Losses', params: { result: 'loss' }, count: 'losses' },
  { id: 'blunders', label: 'Had a blunder', params: { kpi: 'blunders' }, count: 'blunders' },
  { id: 'thrown', label: 'Thrown wins', params: { kpi: 'thrown' }, count: 'thrown' },
] as const
const QUICK_PARAMS = ['to_review', 'result', 'kpi'] as const

const KPI_LABEL: Record<string, string> = {
  blunders: 'Had a blunder',
  thrown: 'Thrown wins',
  unconverted: 'Unconverted wins',
  unpunished: 'Missed opponent blunders',
  comebacks: 'Comebacks',
  analysed: 'Analysed',
}

export function GamesPage() {
  const [params, setParams] = useSearchParams()
  const page = Number(params.get('page') ?? 1)

  /** Set or clear URL params; any change other than paging goes back to page 1. */
  const update = (patch: Record<string, string | null>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v)
          else next.delete(k)
        }
        if (!('page' in patch)) next.delete('page')
        return next
      },
      { replace: !('page' in patch) },
    )
  }

  const { data, error, loading } = useApi<GamesResponse>(`/api/games?${params}`)

  const activeFilters = [
    ...(Object.keys(FILTERS) as FilterKey[]).filter((k) => params.get(k)),
    ...(Object.keys(TOGGLES) as ToggleKey[]).filter((k) => params.get(k)),
  ]
  const quick = QUICK.find((q) =>
    QUICK_PARAMS.every((k) => (params.get(k) ?? undefined) === (q.params as Record<string, string>)[k]),
  )
  // A link from Progress can carry a KPI that has no pill ("Comebacks"): it shows as a chip.
  const kpi = params.get('kpi')
  const extraKpi = kpi && !quick ? kpi : null
  const pickQuick = (q: (typeof QUICK)[number]) =>
    update({ ...Object.fromEntries(QUICK_PARAMS.map((k) => [k, null])), ...q.params })
  const resetFilters = () => update(Object.fromEntries([...activeFilters, ...QUICK_PARAMS].map((k) => [k, null])))
  const days = groupByDay(data?.games ?? [])

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold">Games</h1>
          {data && (
            <p className="mt-0.5 text-muted-foreground">
              {data.counts.all} game{data.counts.all === 1 ? '' : 's'}
              {activeFilters.length || params.get('q') ? ' match' : ''}
            </p>
          )}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
          <SearchBox value={params.get('q') ?? ''} onChange={(q) => update({ q: q || null })} />
          <FilterPopover params={params} update={update} count={activeFilters.length} total={data?.counts.all} onReset={resetFilters} />
        </div>
      </div>

      <div role="tablist" aria-label="Quick filters" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap">
        {QUICK.map((q) => {
          const on = quick?.id === q.id
          const count = data?.counts[q.count]
          return (
            <button
              key={q.id}
              role="tab"
              aria-selected={on}
              onClick={() => pickQuick(q)}
              className={cn(
                'inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3.5 text-sm font-extrabold transition-colors',
                on
                  ? 'bg-foreground text-background'
                  : 'bg-card text-foreground shadow-[inset_0_0_0_2px_var(--line),0_2px_0_var(--lip)] hover:bg-muted',
              )}
            >
              {q.label}
              {count != null && (
                <span
                  className={cn(
                    'rounded-sm px-1.5 py-0.5 text-xs tabular-nums',
                    on ? 'bg-background/20' : 'bg-surface-muted text-muted-foreground',
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {(activeFilters.length > 0 || extraKpi) && (
        <div className="flex flex-wrap items-center gap-2">
          {extraKpi && <FilterChip label={KPI_LABEL[extraKpi] ?? extraKpi} onRemove={() => update({ kpi: null })} />}
          {activeFilters.map((k) => (
            <FilterChip key={k} label={chipLabel(k, params.get(k)!)} onRemove={() => update({ [k]: null })} />
          ))}
          <button onClick={resetFilters} className="text-xs font-bold text-muted-foreground hover:text-foreground">
            Clear all
          </button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">Couldn't load games. {error}</p>}

      <div className={cn('flex flex-col gap-6 transition-opacity', loading && data && 'opacity-60')}>
        {!data && (
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[72px] rounded-xl" />
            ))}
          </div>
        )}
        {days.map(([day, games]) => (
          <section key={day} aria-label={day} className="flex flex-col gap-2.5">
            <h2 className="eyebrow">{day}</h2>
            <ol className="flex flex-col gap-2.5">
              {games.map((g) => (
                <li key={g.id}>
                  <GameRow game={g} />
                </li>
              ))}
            </ol>
          </section>
        ))}
        {data && !data.games.length && (
          <div className="panel">
            {quick?.id === 'review' && !activeFilters.length ? (
              <EmptyState
                title="All caught up"
                action={
                  <Button asChild variant="outline">
                    <Link to="/play">Play a game</Link>
                  </Button>
                }
              >
                Every game from the last week is reviewed. New games show up here once they're analysed.
              </EmptyState>
            ) : (
              <EmptyState
                title="No games match these filters"
                action={
                  <Button variant="outline" onClick={resetFilters}>
                    Reset filters
                  </Button>
                }
              >
                Try a wider date range or fewer filters.
              </EmptyState>
            )}
          </div>
        )}
      </div>

      {data && data.total > data.page_size && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(page - 1) * data.page_size + 1}–{Math.min(page * data.page_size, data.total)} of {data.total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => update({ page: page > 2 ? String(page - 1) : null })}>
              <CaretLeftIcon /> Newer
            </Button>
            <Button variant="outline" disabled={page * data.page_size >= data.total} onClick={() => update({ page: String(page + 1) })}>
              Older <CaretRightIcon />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Games under "Today", "Yesterday", "Mon, Oct 5" headings, in your time zone. */
function groupByDay(games: Game[]): [string, Game[]][] {
  const key = (d: Date) => d.toDateString()
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const out: [string, Game[]][] = []
  for (const g of games) {
    const d = new Date(g.played_at)
    const label =
      key(d) === key(today)
        ? 'Today'
        : key(d) === key(yesterday)
          ? 'Yesterday'
          : d.toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
            })
    const last = out[out.length - 1]
    if (last?.[0] === label) last[1].push(g)
    else out.push([label, [g]])
  }
  return out
}

const ENDED: Record<string, string> = { Resigned: 'resignation', Time: 'on time', Checkmate: 'checkmate', Abandoned: 'abandoned' }

/** One game as a card: result, opponent, when and how it ended, opening, accuracy, its
 * blunders and mistakes (or Clean), and whether you've reviewed it. On a phone: the opening
 * under the opponent, and accuracy over the review status on the right. */
function GameRow({ game: g }: { game: Game }) {
  const badges = [
    ...Array<'blunder'>(Math.min(g.blunders ?? 0, 3)).fill('blunder'),
    ...Array<'mistake'>(Math.max(0, Math.min(g.mistakes ?? 0, 3 - Math.min(g.blunders ?? 0, 3)))).fill('mistake'),
  ]
  const time = g.played_at.length > 10 ? new Date(g.played_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : null
  const ended = g.ended_by ? (ENDED[g.ended_by] ?? g.ended_by.toLowerCase()) : null
  return (
    <Link
      to={`/games/${g.id}`}
      className="panel panel-link grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 px-4 py-3 md:grid-cols-[2rem_minmax(0,1.4fr)_minmax(0,1.6fr)_4.5rem_6.5rem_7rem]"
    >
      <ResultBadge outcome={g.outcome} />
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-base font-extrabold">
          <ColorDot color={g.color} />
          <span className="truncate">{g.opponent}</span>
          <span className="font-semibold text-muted-foreground">{g.opponent_rating}</span>
        </div>
        <div className="hidden truncate text-[13px] text-muted-foreground md:block">
          {[time, timeControl(g.time_control), ended].filter(Boolean).join(' · ')}
        </div>
        <div className="truncate text-xs text-muted-foreground md:hidden">{openingLabel(g.opening, g.eco)}</div>
      </div>
      <div className="hidden min-w-0 truncate text-sm text-muted-foreground md:block">{openingLabel(g.opening, g.eco)}</div>
      <div className="hidden text-right md:block">
        <div className="font-heading text-xl font-bold tabular-nums">{num(g.accuracy, 1)}</div>
        <div className="text-[11px] font-extrabold tracking-[.06em] text-muted-foreground uppercase">Accuracy</div>
      </div>
      <div className="hidden items-center justify-end gap-1 md:flex">
        {!g.analysed ? (
          <span className="text-[13px] text-muted-foreground">Not analysed</span>
        ) : badges.length ? (
          badges.map((b, i) => <MoveBadge key={i} kind={b} />)
        ) : (
          <span className="text-[13px] font-extrabold text-brand-text">Clean</span>
        )}
      </div>
      <div className="text-right md:hidden">
        <div className="font-heading text-[17px] font-bold tabular-nums">{num(g.accuracy, 1)}</div>
        <div className={cn('text-[11px] font-extrabold tracking-[.04em] uppercase', g.reviewed_at ? 'text-brand-text' : 'text-muted-foreground')}>
          {g.reviewed_at ? 'Reviewed' : g.analysed ? 'To review' : 'Not analysed'}
        </div>
      </div>
      <div className="hidden justify-end md:flex">
        {g.reviewed_at ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-brand-text">
            <CheckIcon className="size-4" /> Reviewed
          </span>
        ) : g.analysed ? (
          <span className="inline-flex h-9 items-center rounded-md border-2 border-line bg-card px-3 text-xs font-extrabold tracking-wide uppercase shadow-[0_3px_0_var(--lip)]">
            Review
          </span>
        ) : null}
      </div>
    </Link>
  )
}

function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  useEffect(() => {
    if (text === value) return
    const t = setTimeout(() => onChange(text.trim()), 250)
    return () => clearTimeout(t)
  }, [text]) // debounce on keystrokes only

  return (
    <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
      <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search opponent or opening"
        aria-label="Search opponent or opening"
        className="pl-8"
      />
    </div>
  )
}

function FilterPopover({
  params,
  update,
  count,
  total,
  onReset,
}: {
  params: URLSearchParams
  update: (patch: Record<string, string | null>) => void
  count: number
  total: number | undefined
  onReset: () => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <FunnelIcon weight="fill" /> Filters
          {count > 0 && <Badge className="ml-1 h-5 min-w-5 px-1.5 tabular-nums">{count}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="flex flex-col gap-3">
          {(Object.entries(FILTERS) as [FilterKey, (typeof FILTERS)[FilterKey]][]).map(([key, f]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <Label className="text-muted-foreground">{f.label}</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={0}
                value={params.get(key) ?? 'any'}
                onValueChange={(v) => update({ [key]: v && v !== 'any' ? v : null })}
              >
                <ToggleGroupItem value="any">{f.any}</ToggleGroupItem>
                {Object.entries(f.options).map(([value, label]) => (
                  <ToggleGroupItem key={value} value={value}>
                    {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          ))}
          {(Object.entries(TOGGLES) as [ToggleKey, string][]).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <Label htmlFor={`f-${key}`} className="text-muted-foreground">
                {label}
              </Label>
              <Checkbox
                id={`f-${key}`}
                checked={params.get(key) === 'true'}
                onCheckedChange={(c) => update({ [key]: c === true ? 'true' : null })}
              />
            </div>
          ))}
          <Separator />
          <div className="flex items-center justify-between text-sm">
            <Button variant="link" className="h-auto p-0" onClick={onReset}>
              Reset
            </Button>
            <span className="text-muted-foreground">{total ?? '…'} games match</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1">
      {label}
      <button onClick={onRemove} aria-label={`Remove ${label}`} className="rounded-sm p-0.5 hover:bg-foreground/10">
        <XIcon className="size-3" />
      </button>
    </Badge>
  )
}

function chipLabel(key: string, value: string) {
  if (key in TOGGLES) return TOGGLES[key as ToggleKey]
  if (key === 'range') return `Last ${RANGE_LABEL[value as '30d' | '90d']}`
  const f = FILTERS[key as FilterKey]
  return (f.options as Record<string, string>)[value] ?? value
}
