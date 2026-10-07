import { Check, Circle, LoaderCircle, Play, Plus, X } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { type RunProgress, send, type Settings, useApi } from '@/lib/api'
import { BOARDS, type Preferences, usePreferences } from '@/lib/preferences'
import { playSound, setSoundEnabled } from '@/lib/sound'
import { cn } from '@/lib/utils'

const SOURCE_LABEL: Record<string, string> = { chesscom: 'Chess.com', lichess: 'Lichess' }
const DEPTHS = [
  { value: 14, label: 'Fast' },
  { value: 18, label: 'Standard' },
  { value: 22, label: 'Deep' },
]

export function SettingsPage() {
  const { data, error, reload } = useApi<Settings>('/api/settings')

  // While an update runs, refresh every couple of seconds to follow its steps.
  useEffect(() => {
    if (!data?.running) return
    const t = setInterval(reload, 2000)
    return () => clearInterval(t)
  }, [data?.running, reload])

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-xl font-medium">Settings</h1>
      <AppearanceSection />
      {error && <p className="text-sm text-destructive">Couldn't load settings. {error}</p>}
      {!data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <>
          <AccountsSection settings={data} reload={reload} />
          <UpdateSection settings={data} reload={reload} />
          <AnalysisSection settings={data} reload={reload} />
          <DataSection settings={data} />
        </>
      )}
      <Link to="/styleguide" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        Style guide
      </Link>
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="panel overflow-hidden">
      <header className="border-b px-4 py-3">
        <h2 className="font-medium">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </header>
      <div className="divide-y">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 text-sm">
      <div className="min-w-0">
        <div>{label}</div>
        {hint && <div className="text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      value={value}
      aria-label={label}
      onValueChange={(v) => v && onChange(v as T)}
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} className="px-3">
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function ErrorText({ children }: { children: ReactNode }) {
  return children ? <p className="px-4 pb-3 text-sm text-destructive">{children}</p> : null
}

function AppearanceSection() {
  const { prefs, set } = usePreferences()
  return (
    <Section title="Appearance and sound" description="Saved in this browser.">
      <Row label="Theme">
        <Segmented<Preferences['theme']>
          label="Theme"
          value={prefs.theme}
          onChange={(theme) => set({ theme })}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </Row>
      <Row label="Board">
        <Segmented<Preferences['board']>
          label="Board colors"
          value={prefs.board}
          onChange={(board) => set({ board })}
          options={Object.entries(BOARDS).map(([value, b]) => ({
            value: value as Preferences['board'],
            label: (
              <span className="flex items-center gap-1.5">
                <span className="grid size-3.5 grid-cols-2 overflow-hidden rounded-[3px]">
                  <span style={{ background: b.light }} />
                  <span style={{ background: b.dark }} />
                  <span style={{ background: b.dark }} />
                  <span style={{ background: b.light }} />
                </span>
                {b.label}
              </span>
            ),
          }))}
        />
      </Row>
      <Row label="Best move in game review" hint="When a move wasn't good, show the engine's move right away or on a click.">
        <Segmented<Preferences['bestArrow']>
          label="Best move in game review"
          value={prefs.bestArrow}
          onChange={(bestArrow) => set({ bestArrow })}
          options={[
            { value: 'auto', label: 'Automatically' },
            { value: 'request', label: 'On request' },
          ]}
        />
      </Row>
      <Row label="Win-chance graph in game review" hint="A graph of your chances across the game, above the move. Click it to jump.">
        <Segmented
          label="Win-chance graph in game review"
          value={prefs.showGraph ? 'on' : 'off'}
          onChange={(v) => set({ showGraph: v === 'on' })}
          options={[
            { value: 'off', label: 'Hidden' },
            { value: 'on', label: 'Shown' },
          ]}
        />
      </Row>
      <Row label="Sounds" hint="Moves on the board, right and wrong answers, and the big moments.">
        <Segmented
          label="Sounds"
          value={prefs.sound ? 'on' : 'off'}
          onChange={(v) => {
            set({ sound: v === 'on' })
            if (v === 'on') {
              setSoundEnabled(true) // before the preference applies, so this sample plays
              playSound('right')
            }
          }}
          options={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
        />
      </Row>
      <Row label="Overview opens on">
        <Segmented<Preferences['overviewRange']>
          label="Overview opens on"
          value={prefs.overviewRange}
          onChange={(overviewRange) => set({ overviewRange })}
          options={[
            { value: '30d', label: '30 days' },
            { value: '90d', label: '90 days' },
            { value: 'all', label: 'All time' },
          ]}
        />
      </Row>
    </Section>
  )
}

/** Chess.com cursors are "2026/10" (months); Lichess game cursors are epoch milliseconds. */
function syncedThrough(cursor: string | null) {
  if (!cursor) return null
  if (/^\d{4}\/\d{2}$/.test(cursor)) {
    const [y, m] = cursor.split('/').map(Number)
    return new Date(y, m - 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }
  if (/^\d{12,}$/.test(cursor)) return new Date(Number(cursor)).toLocaleDateString()
  return cursor
}

function AccountsSection({ settings, reload }: { settings: Settings; reload: () => void }) {
  const [source, setSource] = useState<'chesscom' | 'lichess'>('chesscom')
  const [handle, setHandle] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const name = handle.trim()
    if (!name) return setError('Enter a username.')
    run(async () => {
      await send('POST', '/api/accounts', { source, handle: name })
      setHandle('')
    })
  }

  return (
    <Section title="Accounts" description="The daily update syncs every account here. Removing one keeps its games.">
      {settings.accounts.map((a) => {
        const key = `${a.source}/${a.handle}`
        const through = syncedThrough(a.synced_through)
        return (
          <Row
            key={key}
            label={<span className="font-medium">{a.handle}</span>}
            hint={`${SOURCE_LABEL[a.source] ?? a.source}${through ? ` · games synced through ${through}` : ''}`}
          >
            {confirming === key ? (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await send('DELETE', `/api/accounts/${a.source}/${encodeURIComponent(a.handle)}`)
                      setConfirming(null)
                    })
                  }
                >
                  Remove {a.handle}
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setConfirming(key)}>
                Remove
              </Button>
            )}
          </Row>
        )
      })}
      <Row
        label="Lichess token"
        hint={
          settings.lichess_token ? (
            'Saved in the macOS Keychain. Used for puzzles and faster game downloads.'
          ) : (
            <>
              Not set. Save one from the terminal so it never passes through the browser:{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                security add-generic-password -a "$USER" -s knightly-lichess -w
              </code>
            </>
          )
        }
      >
        {settings.lichess_token ? (
          <Badge variant="secondary" className="gap-1">
            <Check className="size-3" /> Saved
          </Badge>
        ) : (
          <Badge variant="outline">Not set</Badge>
        )}
      </Row>
      <form onSubmit={add} className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Segmented
          label="Site"
          value={source}
          onChange={setSource}
          options={[
            { value: 'chesscom', label: 'Chess.com' },
            { value: 'lichess', label: 'Lichess' },
          ]}
        />
        <Input
          value={handle}
          onChange={(e) => {
            setHandle(e.target.value)
            setError(null)
          }}
          placeholder="username"
          aria-label="Username"
          className="h-8 w-48"
        />
        <Button type="submit" size="sm" disabled={busy}>
          <Plus /> Add account
        </Button>
        <span className="basis-full text-xs text-muted-foreground">
          Its full game history is imported on the next update.
        </span>
      </form>
      <ErrorText>{error}</ErrorText>
    </Section>
  )
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function UpdateSection({ settings, reload }: { settings: Settings; reload: () => void }) {
  const current = settings.schedule
  const [time, setTime] = useState(current ? `${pad(current.hour)}:${pad(current.minute)}` : '06:00')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSteps, setShowSteps] = useState(false)
  const savedTime = current ? `${pad(current.hour)}:${pad(current.minute)}` : null

  const call = async (what: string, action: () => Promise<unknown>) => {
    setBusy(what)
    setError(null)
    try {
      await action()
      reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const saveSchedule = (enabled: boolean) =>
    call('schedule', () => {
      const [hour, minute] = time.split(':').map(Number)
      return send('PUT', '/api/settings/schedule', { enabled, hour, minute })
    })

  const last = settings.last_run
  const running = settings.running || busy === 'run'

  return (
    <Section
      title="Daily update"
      description="Syncs every account, analyses new games, and backs up the database. If the Mac is asleep at that time, it runs on wake."
    >
      <Row
        label="Run every day"
        hint={current ? (current.loaded ? `On, at ${savedTime}` : 'Installed but not loaded. Save again to fix.') : 'Off'}
      >
        <div className="flex items-center gap-2">
          <Input
            type="time"
            step={300}
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-label="Time of day"
            className="h-8 w-32"
          />
          {current ? (
            <>
              {time !== savedTime && (
                <Button size="sm" disabled={!!busy} onClick={() => saveSchedule(true)}>
                  Save time
                </Button>
              )}
              <Button variant="outline" size="sm" disabled={!!busy} onClick={() => saveSchedule(false)}>
                Turn off
              </Button>
            </>
          ) : (
            <Button size="sm" disabled={!!busy} onClick={() => saveSchedule(true)}>
              Turn on
            </Button>
          )}
        </div>
      </Row>
      {settings.current_run ? (
        <div className="px-4 py-3 text-sm">
          <div className="mb-2 flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 font-medium">
              <LoaderCircle className="size-4 animate-spin" /> Updating
            </span>
            <span className="text-muted-foreground tabular-nums">
              <Elapsed since={settings.current_run.started_at} />
            </span>
          </div>
          {settings.current_run.progress ? (
            <StepList progress={settings.current_run.progress} />
          ) : (
            <p className="text-muted-foreground">Starting…</p>
          )}
        </div>
      ) : (
        <>
          <Row
            label={
              <span className="flex items-center gap-2">
                Last run
                {last && <RunStatus status={last.status} />}
              </span>
            }
            hint={
              last
                ? `${new Date(last.started_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · ${
                    last.new_games ?? 0
                  } new games, ${last.new_puzzles ?? 0} puzzles, ${last.games_analysed ?? 0} analysed`
                : 'Never'
            }
          >
            <div className="flex items-center gap-2">
              {last?.progress && (
                <Button variant="ghost" size="sm" onClick={() => setShowSteps((v) => !v)}>
                  {showSteps ? 'Hide steps' : 'Steps'}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={running}
                onClick={() =>
                  call('run', async () => {
                    await send('POST', '/api/update/run')
                    // The job takes a moment to record itself as running; stay busy until it has.
                    await new Promise((r) => setTimeout(r, 2000))
                  })
                }
              >
                {running ? <LoaderCircle className="animate-spin" /> : <Play />}
                {running ? 'Starting' : 'Run now'}
              </Button>
            </div>
          </Row>
          {showSteps && last?.progress && (
            <div className="px-4 py-3">
              <StepList progress={last.progress} />
            </div>
          )}
          {!showSteps && !!last?.errors.length && <ErrorText>{last.errors.join(' · ')}</ErrorText>}
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </Section>
  )
}

const SOURCE_NAMES: Record<string, string> = { chesscom: 'Chess.com', lichess: 'Lichess' }

function stepLabel(key: string) {
  if (key === 'analyze') return 'Analyse new games'
  if (key === 'backup') return 'Back up the database'
  const [, source, handle] = key.split(':')
  return `Sync ${SOURCE_NAMES[source] ?? source} · ${handle}`
}

/** The run's steps in order: done (with result), running (with detail), or still to come. */
function StepList({ progress }: { progress: RunProgress }) {
  const done = new Map(progress.done.map((d) => [d.key, d]))
  return (
    <ol className="flex flex-col gap-2.5 text-sm">
      {progress.plan.map((key) => {
        const result = done.get(key)
        const active = progress.current === key
        return (
          <li key={key} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
              {result?.error ? (
                <X className="size-4 text-danger-text" />
              ) : result ? (
                <Check className="size-4 text-brand-text" />
              ) : active ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Circle className="size-3 text-muted-foreground/50" />
              )}
            </span>
            <span className="min-w-0">
              <span className={cn(!result && !active && 'text-muted-foreground')}>{stepLabel(key)}</span>
              {(result || active) && (
                <span className={cn('block text-muted-foreground', result?.error && 'text-danger-text')}>
                  {result ? (result.error ?? result.summary) : (progress.detail ?? 'Working…')}
                </span>
              )}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** "1:42" since `since`, ticking every second. */
function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.floor((now - Date.parse(since)) / 1000))
  return <>{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</>
}

function RunStatus({ status }: { status: 'ok' | 'partial' | 'failed' }) {
  const look = {
    ok: { label: 'OK', className: 'bg-win/15 text-brand-text' },
    partial: { label: 'Partly failed', className: 'bg-gold/15 text-gold-text' },
    failed: { label: 'Failed', className: 'bg-loss/15 text-danger-text' },
  }[status]
  return (
    <span className={cn('rounded px-1.5 text-xs', look.className)}>
      {status === 'ok' ? <Check className="mr-0.5 inline size-3" /> : <X className="mr-0.5 inline size-3" />}
      {look.label}
    </span>
  )
}

function AnalysisSection({ settings, reload }: { settings: Settings; reload: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const options = DEPTHS.some((d) => d.value === settings.depth)
    ? DEPTHS
    : [...DEPTHS, { value: settings.depth, label: 'Custom' }].sort((a, b) => a.value - b.value)

  return (
    <Section title="Analysis">
      <Row label="Engine" hint={settings.engine ? undefined : 'Install it with: brew install stockfish'}>
        <span className="text-muted-foreground">{settings.engine ?? 'Not found'}</span>
      </Row>
      <Row label="Depth" hint="Deeper finds more but takes longer. Applies to games analysed from now on.">
        <Segmented
          label="Analysis depth"
          value={String(settings.depth)}
          onChange={async (v) => {
            setError(null)
            try {
              await send('PUT', '/api/settings/analysis', { depth: Number(v) })
              reload()
            } catch (e) {
              setError((e as Error).message)
            }
          }}
          options={options.map((d) => ({
            value: String(d.value),
            label: (
              <span>
                {d.label} <span className="text-muted-foreground">{d.value}</span>
              </span>
            ),
          }))}
        />
      </Row>
      <Row label="Move classification" hint="Chess.com's bands. A move losing 20+ points of win chance is a blunder; Great is the only move that held, Brilliant a sound sacrifice.">
        <span className="text-muted-foreground">Fixed</span>
      </Row>
      <ErrorText>{error}</ErrorText>
    </Section>
  )
}

function DataSection({ settings }: { settings: Settings }) {
  const { database: db, backups } = settings
  const mb = (db.bytes / 1024 / 1024).toFixed(1)
  return (
    <Section title="Data">
      <Row
        label="Database"
        hint={<span className="break-all">{db.path}</span>}
      >
        <span className="text-right text-muted-foreground">
          {mb} MB · {db.games} games · {db.analysed} analysed
        </span>
      </Row>
      <Row label="Backups" hint={<span className="break-all">{backups.dir}</span>}>
        <span className="text-muted-foreground">
          {backups.count} saved · newest {backups.keep} kept
        </span>
      </Row>
    </Section>
  )
}
