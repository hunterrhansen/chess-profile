import { CheckIcon, CircleIcon, CircleNotchIcon, PlayIcon, PlusIcon, XIcon } from '@phosphor-icons/react'
import { type ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { LoadingBlock } from '@/components/empty-state'
import { type Glyph, KnIcon } from '@/components/kn-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { type RunProgress, send, type Settings, useApi } from '@/lib/api'
import { SignedInAs } from '@/lib/auth'
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
      <h1 className="text-4xl font-bold">Settings</h1>
      <AppearanceSection />
      {error && <p className="text-sm text-destructive">Couldn't load settings. {error}</p>}
      {!data ? (
        <LoadingBlock label="Loading your settings…" className="h-96 rounded-xl" />
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

/** A settings card: its brand icon, title and what it's for, then its rows. */
export function Section({ title, glyph, description, children }: { title: string; glyph: Glyph; description?: string; children: ReactNode }) {
  return (
    <section className="panel overflow-hidden">
      <header className="flex items-center gap-3.5 border-b-2 px-5 py-4">
        <KnIcon glyph={glyph} className="size-[34px]" />
        <div className="min-w-0">
          <h2 className="font-heading text-xl font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </header>
      <div className="divide-y-2">{children}</div>
    </section>
  )
}

/** One setting: its name (and a hint) on the left, the control on the right. */
export function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3.5">
      <div className="min-w-0 flex-1 basis-60">
        <div className="font-extrabold">{label}</div>
        {hint && <div className="mt-0.5 text-[13px] text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

/** A segmented control: the options on a sunken track, the chosen one raised on its ledge. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1 rounded-[14px] bg-surface-muted p-1">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            title={o.title}
            aria-pressed={on}
            onClick={() => !on && onChange(o.value)}
            className={cn(
              'grid h-[34px] place-items-center rounded-[10px] px-3 text-sm font-extrabold whitespace-nowrap transition-colors duration-(--duration-quick)',
              on ? 'bg-card text-foreground shadow-[0_2px_0_var(--lip)]' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** A green "Saved" / "OK" pill. */
function OkPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-brand/18 px-2.5 py-1 text-[13px] font-extrabold text-brand-text">
      {children}
    </span>
  )
}

function ErrorText({ children }: { children: ReactNode }) {
  return children ? <p className="px-5 pb-3 text-sm text-destructive">{children}</p> : null
}

function AppearanceSection() {
  const { prefs, set } = usePreferences()
  return (
    <Section title="Appearance and sound" glyph="star" description="Saved in this browser.">
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
      <Row label="Board" hint="Sage is the Knightly board; the others match other sites.">
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
            { value: 'auto', label: 'Right away' },
            { value: 'request', label: 'On a click' },
          ]}
        />
      </Row>
      <Row label="Sounds" hint="Moves on the board, right and wrong answers, and the big moments.">
        <Switch
          aria-label="Sounds"
          checked={prefs.sound}
          onCheckedChange={(on) => {
            set({ sound: on })
            if (on) {
              setSoundEnabled(true) // before the preference applies, so this sample plays
              playSound('right')
            }
          }}
        />
      </Row>
      <Row label="Progress opens on">
        <Segmented<Preferences['overviewRange']>
          label="Progress opens on"
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
    <Section title="Accounts" glyph="games" description="The daily update syncs every account here. Removing one keeps its games.">
      <SignedInAs />
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
          <OkPill>
            <CheckIcon className="size-3" /> Saved
          </OkPill>
        ) : (
          <Badge variant="outline">Not set</Badge>
        )}
      </Row>
      <form onSubmit={add} className="flex flex-wrap items-center gap-2 px-5 py-3.5">
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
          className="h-10 w-48"
        />
        <Button type="submit" variant="outline" disabled={busy}>
          <PlusIcon /> Add account
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
      glyph="goal"
      description={
        settings.schedule_available
          ? 'Syncs every account, analyses new games, and backs up the database. If the Mac is asleep at that time, it runs on wake.'
          : 'Syncs every account, analyses new games, and backs up the database.'
      }
    >
      {settings.schedule_available && (
        <Row
          label="Run every day"
          hint={current ? (current.loaded ? `On, at ${savedTime}` : 'Installed but not loaded. Save again to fix.') : 'Off'}
        >
          <div className="flex items-center gap-2.5">
            <Input
              type="time"
              step={300}
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-label="Time of day"
              className="h-10 w-32"
            />
            {current && time !== savedTime && (
              <Button size="sm" disabled={!!busy} onClick={() => saveSchedule(true)}>
                Save time
              </Button>
            )}
            <Switch
              aria-label="Run every day"
              checked={!!current}
              disabled={!!busy}
              onCheckedChange={(on) => saveSchedule(on)}
            />
          </div>
        </Row>
      )}
      {settings.current_run ? (
        <div className="px-5 py-3.5 text-sm">
          <div className="mb-2 flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 font-medium">
              <CircleNotchIcon className="size-4 animate-spin" /> Updating
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
            hint={last ? `${runWhen(last.started_at)} · ${runSummary(last)}` : 'Never'}
          >
            <div className="flex items-center gap-2">
              {last?.progress && (
                <Button variant="ghost" size="sm" onClick={() => setShowSteps((v) => !v)}>
                  {showSteps ? 'Hide steps' : 'Steps'}
                </Button>
              )}
              <Button
                variant="sky"
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
                {running ? <CircleNotchIcon className="animate-spin" /> : <PlayIcon weight="fill" />}
                {running ? 'Starting' : 'Run now'}
              </Button>
            </div>
          </Row>
          {showSteps && last?.progress && (
            <div className="px-5 py-3.5">
              <StepList progress={last.progress} />
            </div>
          )}
          {!showSteps && !!last?.errors.length && <ErrorText>{last.errors.join(' · ')}</ErrorText>}
          {settings.earlier_runs.map((r) => (
            <Row
              key={r.started_at}
              label={<span className="font-semibold text-muted-foreground">{runWhen(r.started_at)}</span>}
              hint={runSummary(r)}
            >
              <RunStatus status={r.status} />
            </Row>
          ))}
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </Section>
  )
}

/** "Today, 6:00 AM", "Yesterday, 12:23 PM", "Oct 5, 6:00 AM". */
function runWhen(iso: string) {
  const d = new Date(iso)
  const day = new Date(d)
  day.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((today.getTime() - day.getTime()) / 86_400_000)
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const date = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${date}, ${time}`
}

/** "8 new games · 8 analysed · 3 puzzles" */
function runSummary(r: { new_games: number | null; new_puzzles: number | null; games_analysed: number | null }) {
  const n = (v: number | null, one: string, many: string) => `${v ?? 0} ${(v ?? 0) === 1 ? one : many}`
  return [
    n(r.new_games, 'new game', 'new games'),
    `${r.games_analysed ?? 0} analysed`,
    r.new_puzzles ? n(r.new_puzzles, 'puzzle', 'puzzles') : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

const SOURCE_NAMES: Record<string, string> = { chesscom: 'Chess.com', lichess: 'Lichess' }

function stepLabel(key: string) {
  if (key === 'analyze') return 'Analyse new games'
  if (key === 'patterns') return 'Name the tactic behind each mistake'
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
                <XIcon className="size-4 text-danger-text" />
              ) : result ? (
                <CheckIcon className="size-4 text-brand-text" />
              ) : active ? (
                <CircleNotchIcon className="size-4 animate-spin" />
              ) : (
                <CircleIcon className="size-3 text-muted-foreground/50" />
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
      {status === 'ok' ? <CheckIcon className="mr-0.5 inline size-3" /> : <XIcon className="mr-0.5 inline size-3" />}
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
    <Section title="Analysis" glyph="engine" description="How your games are analysed.">
      <Row label="Engine" hint={settings.engine ? undefined : 'Install it with: brew install stockfish'}>
        <span className="font-extrabold">{settings.engine ?? 'Not found'}</span>
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
          options={options.map((d) => ({ value: String(d.value), label: d.label, title: `Depth ${d.value}` }))}
        />
      </Row>
      <Row label="Move classification" hint="Chess.com's bands. A move losing 20+ points of win chance is a blunder; Great is the only move that held, Brilliant a sound sacrifice.">
        <span className="font-extrabold">Fixed</span>
      </Row>
      <Row
        label="Review deck schedule"
        hint={
          settings.fsrs.personal
            ? `FSRS, as in Anki, tuned to your answers${settings.fsrs.tuned_reviews ? ` (${settings.fsrs.tuned_reviews} reviews)` : ''}. Run knightly fsrs-optimize again now and then.`
            : `FSRS, as in Anki, with its default settings. At ${settings.fsrs.needed} reviews, knightly fsrs-optimize can tune it to you, like Anki's Optimize.`
        }
      >
        <span className="font-extrabold whitespace-nowrap">
          {settings.fsrs.personal ? 'Tuned to you' : `${settings.fsrs.reviews} of ${settings.fsrs.needed}`}
        </span>
      </Row>
      <ErrorText>{error}</ErrorText>
    </Section>
  )
}

function DataSection({ settings }: { settings: Settings }) {
  const { database: db, backups } = settings
  const mb = (db.bytes / 1024 / 1024).toFixed(1)
  return (
    <Section title="Data" glyph="notes" description="Everything lives in one Postgres database.">
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
