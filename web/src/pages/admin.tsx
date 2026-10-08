import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react'
import { type ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { LoadingBlock } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { StatLabel, StatValue } from '@/components/ui/stat'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { type AdminJob, type AdminOverview, send, useApi } from '@/lib/api'
import { cn, megabytes } from '@/lib/utils'

/** Supabase's free plan holds this much; past it, the next step is Pro. */
const DATABASE_LIMIT = 500 * 1024 * 1024
const REFRESH_MS = 10_000

/** "4 min ago", "in 3 min", "2 h ago": for times within a day or two. */
function relative(iso: string | null, now = Date.now()) {
  if (!iso) return 'never'
  const minutes = Math.round((new Date(iso).getTime() - now) / 60_000)
  const size = Math.abs(minutes)
  const text = size < 1 ? 'now' : size < 90 ? `${size} min` : size < 48 * 60 ? `${Math.round(size / 60)} h` : `${Math.round(size / 1440)} d`
  return text === 'now' ? 'just now' : minutes < 0 ? `${text} ago` : `in ${text}`
}

/** /settings/admin (KNIGHTLY_ADMINS): the job queue, failures to retry, and everyone's usage.
 * Refreshes every 10 seconds. */
export function AdminPage() {
  const { data, error, reload } = useApi<AdminOverview>('/api/admin')
  useEffect(() => {
    const t = setInterval(reload, REFRESH_MS)
    return () => clearInterval(t)
  }, [reload])

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Link to="/settings" className="text-sm font-extrabold text-muted-foreground hover:text-foreground">
          Settings ›
        </Link>
        <h1 className="text-4xl font-bold">Admin</h1>
        <span className="flex-1" />
        <span className="text-sm text-muted-foreground">Refreshes every 10 seconds</span>
      </div>
      {error && <p className="text-sm text-destructive">{error.startsWith('403') ? 'Admins only.' : `Couldn't load: ${error}`}</p>}
      {!data ? !error && <LoadingBlock label="Loading the queue…" className="h-96 rounded-xl" /> : <Overview data={data} reload={reload} />}
    </div>
  )
}

function Overview({ data, reload }: { data: AdminOverview; reload: () => void }) {
  const waitingSince = data.queued.length ? relative(data.queued.map((j) => j.created_at).sort()[0]) : null
  const names = Object.fromEntries(data.users.map((u) => [u.clerk_id, u.accounts?.split(', ')[0]?.split(':')[1] ?? u.clerk_id]))
  return (
    <>
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <Tile label="Running" value={data.running.length} sub={data.running.length ? `since ${relative(data.running[0].locked_at)}` : 'idle'} />
        <Tile label="Waiting" value={data.queued.length} sub={waitingSince ? `oldest ${waitingSince}` : 'nothing'} />
        <Tile label="Done today" value={data.last_day.done} sub="last 24 hours" className="text-brand-text" />
        <Tile label="Failed today" value={data.last_day.failed} sub="last 24 hours" className={data.last_day.failed ? 'text-danger-text' : undefined} />
      </div>

      <div className="panel px-5 py-4">
        <Progress
          label="Database"
          tone="sky"
          value={(data.database_bytes / DATABASE_LIMIT) * 100}
          valueText={`${megabytes(data.database_bytes)} of 500 MB (Supabase free)`}
        />
      </div>

      {data.failed.length > 0 && (
        <Part title="Failed">
          <div className="panel divide-y-2 overflow-hidden">
            {data.failed.map((job) => (
              <FailedJob key={job.id} job={job} who={names[job.clerk_id] ?? job.clerk_id} reload={reload} />
            ))}
          </div>
        </Part>
      )}

      <Part title="Running and waiting">
        <div className="panel divide-y-2 overflow-hidden">
          {data.running.length + data.queued.length === 0 && <p className="px-5 py-4 text-muted-foreground">Nothing to do.</p>}
          {[...data.running, ...data.queued].map((job) => (
            <div key={job.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
              <span className={cn('size-3 flex-none rounded-full', job.status === 'running' ? 'bg-sky' : 'bg-line')} />
              <span className="basis-24 font-extrabold">{job.kind}</span>
              <span className="min-w-0 flex-1 basis-48 truncate">
                {names[job.clerk_id] ?? job.clerk_id}
                {job.attempts > (job.status === 'running' ? 1 : 0) && <span className="text-muted-foreground"> · attempt {job.attempts}</span>}
              </span>
              <span className="text-sm text-muted-foreground">
                {job.status === 'running'
                  ? `running ${relative(job.locked_at).replace(' ago', '')}`
                  : job.attempts > 0
                    ? `retry ${relative(job.run_after)}`
                    : `waiting ${relative(job.created_at).replace(' ago', '')}`}
              </span>
            </div>
          ))}
        </div>
      </Part>

      <Part title="People" note="Size is an estimate: about 3 KB a game, 11 KB more once analysed.">
        <div className="panel overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Person</TableHead>
                <TableHead>Accounts</TableHead>
                <TableHead className="text-right">Games</TableHead>
                <TableHead className="text-right">Analysed</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead className="pr-4">Last update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="px-4">
                    <div className="font-extrabold">{names[u.clerk_id] === u.clerk_id ? '(no account yet)' : names[u.clerk_id]}</div>
                    <div className="font-mono text-xs text-muted-foreground">{u.clerk_id}</div>
                  </TableCell>
                  <TableCell>{u.accounts?.replace(/chesscom:/g, 'Chess.com ').replace(/lichess:/g, 'Lichess ') ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{u.games.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{u.analysed.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{megabytes(u.approx_bytes)}</TableCell>
                  <TableCell className="pr-4">{relative(u.last_update)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Part>
    </>
  )
}

function FailedJob({ job, who, reload }: { job: AdminJob; who: string; reload: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
      <Badge variant="destructive">{job.kind}</Badge>
      <div className="min-w-0 flex-1 basis-72">
        <div className="font-extrabold">
          {who} · {job.attempts} attempt{job.attempts === 1 ? '' : 's'}
        </div>
        <div className="font-mono text-[13px] break-all text-muted-foreground">{error ?? job.error}</div>
      </div>
      <span className="text-sm text-muted-foreground">{relative(job.finished_at)}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await send('POST', `/api/admin/jobs/${job.id}/retry`)
            reload()
          } catch (e) {
            setError((e as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <ArrowCounterClockwiseIcon />
        Retry
      </Button>
    </div>
  )
}

function Tile({ label, value, sub, className }: { label: string; value: number; sub: string; className?: string }) {
  return (
    <div className="panel flex flex-col gap-1 px-4.5 py-4">
      <StatLabel>{label}</StatLabel>
      <StatValue className={className}>{value.toLocaleString()}</StatValue>
      <span className="text-[13px] text-muted-foreground">{sub}</span>
    </div>
  )
}

function Part({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-2xl font-bold">{title}</h2>
      {children}
      {note && <p className="text-[13px] text-muted-foreground">{note}</p>}
    </section>
  )
}
