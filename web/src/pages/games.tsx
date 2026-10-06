import { ChevronLeft, ChevronRight, ListFilter, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ColorDot, ResultBadge } from '@/components/game-bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { type GamesPage as GamesResponse, useApi } from '@/lib/api'
import { num, openingLabel, RANGE_LABEL, shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Filters live in the URL so overview KPIs can link straight to a filtered list. */
const FILTERS = {
  speed: { label: 'Speed', options: { rapid: 'Rapid', daily: 'Daily' }, any: 'All' },
  color: { label: 'Color', options: { white: 'White', black: 'Black' }, any: 'Both' },
  result: { label: 'Result', options: { win: 'Win', loss: 'Loss', draw: 'Draw' }, any: 'Any' },
  range: { label: 'Date range', options: { '30d': '30d', '90d': '90d' }, any: 'All' },
} as const
type FilterKey = keyof typeof FILTERS
const TOGGLES = { analysed: 'Analysed only', unrated: 'Include unrated' } as const
type ToggleKey = keyof typeof TOGGLES

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
  const navigate = useNavigate()
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
  const kpi = params.get('kpi')
  const resetFilters = () =>
    update(Object.fromEntries([...activeFilters, 'kpi'].map((k) => [k, null])))

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-medium">Games</h1>

      <div className="flex gap-2">
        <SearchBox value={params.get('q') ?? ''} onChange={(q) => update({ q: q || null })} />
        <FilterPopover
          params={params}
          update={update}
          count={activeFilters.length}
          total={data?.total}
          onReset={resetFilters}
        />
      </div>

      {(activeFilters.length > 0 || kpi) && (
        <div className="flex flex-wrap items-center gap-2">
          {kpi && (
            <FilterChip label={`KPI: ${KPI_LABEL[kpi] ?? kpi}`} onRemove={() => update({ kpi: null })} />
          )}
          {activeFilters.map((k) => (
            <FilterChip key={k} label={chipLabel(k, params.get(k)!)} onRemove={() => update({ [k]: null })} />
          ))}
          <button onClick={resetFilters} className="text-xs text-muted-foreground hover:text-foreground">
            Clear all
          </button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">Couldn't load games. {error}</p>}

      <div className={cn('rounded-xl ring-1 ring-foreground/10', loading && data && 'opacity-60')}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead className="w-20">Date</TableHead>
              <TableHead>Opponent</TableHead>
              <TableHead className="hidden md:table-cell">Opening</TableHead>
              <TableHead className="hidden sm:table-cell">Ended by</TableHead>
              <TableHead className="w-14 text-right">Acc</TableHead>
              <TableHead className="hidden w-14 text-right sm:table-cell">Moves</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data &&
              Array.from({ length: 8 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-5" />
                  </TableCell>
                </TableRow>
              ))}
            {data?.games.map((g) => (
                <TableRow key={g.id} onClick={() => navigate(`/games/${g.id}`)} className="cursor-pointer">
                  <TableCell>
                    <ResultBadge outcome={g.outcome} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{shortDate(g.played_at)}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <ColorDot color={g.color} />
                      <Link
                        to={`/games/${g.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="truncate hover:underline"
                      >
                        {g.opponent}
                      </Link>
                      <span className="text-muted-foreground">{g.opponent_rating}</span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden max-w-xs truncate md:table-cell">
                    {openingLabel(g.opening, g.eco)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{g.ended_by}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(g.accuracy)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{g.moves ?? '—'}</TableCell>
                </TableRow>
            ))}
            {data && !data.games.length && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-12 text-center">
                  <p className="font-medium">No games match these filters</p>
                  <Button variant="link" onClick={resetFilters}>
                    Reset filters
                  </Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.total > data.page_size && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(page - 1) * data.page_size + 1}–{Math.min(page * data.page_size, data.total)} of {data.total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => update({ page: page > 2 ? String(page - 1) : null })}
            >
              <ChevronLeft /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * data.page_size >= data.total}
              onClick={() => update({ page: String(page + 1) })}
            >
              Next <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
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
    <div className="relative flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
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
          <ListFilter /> Filters
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
        <X className="size-3" />
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
