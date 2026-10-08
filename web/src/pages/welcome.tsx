import { CircleNotchIcon } from '@phosphor-icons/react'
import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { KnIcon } from '@/components/kn-icon'
import { LessonBar, LessonScreen } from '@/components/lesson-bar'
import { LogoLoader, LogoMark } from '@/components/logo'
import { MoveBadge } from '@/components/move-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { apiFetch, type LookupAccount, type Onboarding, send, useApi } from '@/lib/api'
import { patternOf } from '@/lib/patterns'
import { cn } from '@/lib/utils'

/**
 * Welcome (canvas: Onboarding › A, guided steps): a new account, from empty to its first
 * lesson. Full screen like a lesson. Pick a site and a username, confirm the account ("Is this
 * you?"), watch the newest games come in with what's found in them, then "Your first lesson is
 * ready". Shown whenever there's no account yet (AppShell sends you here).
 */
type Step = 'pick' | 'found' | 'importing' | 'ready'
type Source = LookupAccount['source']

export const SITES: Record<Source, { name: string; initial: string; tile: string; line: string }> = {
  chesscom: { name: 'Chess.com', initial: 'C', tile: 'bg-foreground text-background', line: 'Your games, every month' },
  lichess: { name: 'Lichess', initial: 'L', tile: 'bg-sky text-on-sky', line: 'Your games, with their clocks' },
}
const STEP_NUMBER: Record<Step, number> = { pick: 1, found: 2, importing: 3, ready: 3 }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function WelcomePage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('pick')
  const [source, setSource] = useState<Source>('chesscom')
  const [handle, setHandle] = useState('')
  const [account, setAccount] = useState<LookupAccount | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data: progress, reload } = useApi<Onboarding>('/api/onboarding')

  // Back after leaving mid-import: carry on where it was.
  useEffect(() => {
    if (step === 'pick' && progress?.accounts.length) setStep('importing')
  }, [progress, step])
  // Follow the import every few seconds; it's done once the newest games are analysed.
  useEffect(() => {
    if (step !== 'importing') return
    const t = setInterval(reload, 3000)
    return () => clearInterval(t)
  }, [step, reload])
  useEffect(() => {
    if (step === 'importing' && progress && !progress.working && progress.target > 0 && progress.analysed >= progress.target) {
      setStep('ready')
    }
  }, [step, progress])

  const lookUp = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/lookup?source=${source}&handle=${encodeURIComponent(handle.trim())}`)
      const body = await res.json()
      if (!res.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'That username didn’t work.')
      setAccount(body as LookupAccount)
      setStep('found')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (!account) return
    setBusy(true)
    try {
      await send('POST', '/api/accounts', { source: account.source, handle: account.handle })
      setStep('importing')
      reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Until we know whether an import is under way, don't show step 1 to someone mid-import.
  if (!progress) return <LogoLoader label="Opening Knightly…" className="min-h-[70svh] justify-center" />
  const ready = progress.analysed > 0
  return (
    <LessonScreen>
      <header className="flex items-center gap-4">
        <LogoMark title="Knightly" className="size-11" />
        <Progress
          className="flex-1"
          label="Setting up"
          tone="sky"
          value={step === 'ready' ? 100 : (STEP_NUMBER[step] / 3) * 100 - 8}
          valueText={step === 'ready' ? 'Done' : `Step ${STEP_NUMBER[step]} of 3`}
        />
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
        {step === 'pick' && (
          <form id="pick" onSubmit={lookUp} className="flex flex-col gap-5">
            <Heading title="Where do you play?" line="Knightly learns from your own games. Pick a site and it brings them all in." />
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(SITES) as Source[]).map((s) => (
                <SiteChoice key={s} source={s} chosen={source === s} onChoose={() => setSource(s)} />
              ))}
            </div>
            <label className="flex flex-col gap-2">
              <span className="font-extrabold">Your {SITES[source].name} username</span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                autoFocus
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={!!error}
                className="h-14 rounded-md border-2 border-line bg-surface px-4 text-lg font-bold outline-none focus:border-focus aria-invalid:border-danger"
              />
            </label>
            {error && <p className="text-sm font-bold text-danger-text">{error}</p>}
            <p className="text-sm text-muted-foreground">
              Games on Chess.com and Lichess are public. Knightly only reads them; it never posts or plays for you.
            </p>
          </form>
        )}

        {step === 'found' && account && (
          <>
            <Heading title="Is this you?" line={`We found this account on ${SITES[account.source].name}.`} />
            <AccountCard account={account} />
            {error && <p className="text-sm font-bold text-danger-text">{error}</p>}
            <p className="text-sm text-muted-foreground">Play on the other site too? Add it later in Settings › Accounts.</p>
          </>
        )}

        {step === 'importing' && <Importing progress={progress} />}

        {step === 'ready' && progress && <Ready progress={progress} />}
      </main>

      <LessonBar tone={step === 'ready' ? 'gold' : 'idle'}>
        {step === 'pick' && (
          <>
            <span className="text-muted-foreground">Step 1 of 3</span>
            <Button form="pick" type="submit" size="lg" disabled={!handle.trim() || busy}>
              {busy && <CircleNotchIcon className="animate-spin" />}
              Continue
            </Button>
          </>
        )}
        {step === 'found' && (
          <>
            <Button variant="outline" size="lg" onClick={() => { setStep('pick'); setError(null) }}>
              Not me
            </Button>
            <Button size="lg" onClick={confirm} disabled={busy}>
              {busy && <CircleNotchIcon className="animate-spin" />}
              That's me
            </Button>
          </>
        )}
        {step === 'importing' && (
          <>
            <span className="text-muted-foreground">
              {ready ? 'You can start now; the rest keeps going.' : 'A few minutes. You can leave; it keeps going.'}
            </span>
            <Button size="lg" onClick={() => navigate('/')} disabled={!ready}>
              Start with what's ready
            </Button>
          </>
        )}
        {step === 'ready' && (
          <Button size="lg" className="md:ml-auto" onClick={() => navigate('/')}>
            Start
          </Button>
        )}
      </LessonBar>
    </LessonScreen>
  )
}

function Heading({ title, line }: { title: string; line: string }) {
  return (
    <div>
      <h1 className="text-3xl leading-tight font-bold">{title}</h1>
      <p className="mt-2 text-lg text-muted-foreground">{line}</p>
    </div>
  )
}

/** A site to pick: its tile, its name and a line; outlined in sky once chosen. */
export function SiteChoice({ source, chosen, onChoose }: { source: Source; chosen: boolean; onChoose: () => void }) {
  const site = SITES[source]
  return (
    <button
      type="button"
      aria-pressed={chosen}
      onClick={onChoose}
      className={cn(
        'mb-1 flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-transform active:translate-y-1 active:shadow-none',
        chosen ? 'border-sky bg-sky/12 shadow-[0_4px_0_var(--sky-lip)]' : 'border-line bg-surface shadow-[0_4px_0_var(--lip)]',
      )}
    >
      <span className={cn('grid size-12 shrink-0 place-items-center rounded-lg font-display text-2xl font-bold', site.tile)}>
        {site.initial}
      </span>
      <span className="min-w-0">
        <span className="block font-display text-xl font-bold">{site.name}</span>
        <span className="hidden text-sm text-muted-foreground sm:block">{site.line}</span>
      </span>
    </button>
  )
}

function since(month: string | null) {
  if (!month) return null
  const [year, m] = month.split('-').map(Number)
  return year === new Date().getFullYear() ? MONTHS[m - 1] : `${MONTHS[m - 1]} ${year}`
}

/** The account found: its initial on a brand disc, the name, what's there, its rating. */
export function AccountCard({ account }: { account: LookupAccount }) {
  const from = since(account.since)
  const games = account.games
    ? `${account.games} rated game${account.games === 1 ? '' : 's'}${from ? ` since ${from}` : ''}`
    : 'No rated games yet'
  return (
    <div className="panel flex items-center gap-4 p-5">
      <span className="grid size-16 shrink-0 place-items-center rounded-full bg-brand font-display text-3xl font-bold text-on-brand shadow-[0_4px_0_var(--brand-lip)]">
        {account.handle[0]?.toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-2xl font-bold">{account.handle}</div>
        <div className="text-sm text-muted-foreground">
          {SITES[account.source].name} · {games}
        </div>
      </div>
      {account.rating != null && (
        <div className="text-right">
          <div className="font-display text-3xl font-bold tabular-nums">{account.rating}</div>
          <div className="eyebrow">{account.rating_kind}</div>
        </div>
      )}
    </div>
  )
}

function Importing({ progress }: { progress: Onboarding | null }) {
  const syncing = !progress || progress.step?.startsWith('sync') || (progress.working && progress.games === 0)
  const rest = progress ? progress.games - progress.target : 0
  return (
    <>
      <Heading title="Bringing in your games" line="Stockfish is going through your newest games first, move by move." />
      <div className="panel flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          {syncing ? <CircleNotchIcon className="size-8 animate-spin text-sky" /> : <KnIcon glyph="check" className="size-8" />}
          <span className="flex-1 font-extrabold">
            {syncing ? 'Looking for your games…' : `${progress!.games} game${progress!.games === 1 ? '' : 's'} found`}
          </span>
        </div>
        {/* Counts settle once the games are all in: until then, only "Looking for your games". */}
        {!syncing && progress && progress.target > 0 && (
          <Progress
            tone="sky"
            label={`Analysing your newest ${progress.target}`}
            value={(Math.min(progress.analysed, progress.target) / progress.target) * 100}
            valueText={`${Math.min(progress.analysed, progress.target)} of ${progress.target}`}
          />
        )}
        {!syncing && rest > 0 && (
          <div className="flex items-center gap-3 text-muted-foreground">
            <KnIcon glyph="lock" className="size-8" />
            <span>The other {rest} follow, 50 at a time, after you start.</span>
          </div>
        )}
        {progress && !progress.working && progress.games === 0 && (
          <p className="text-muted-foreground">No games there yet. Play one, and it comes in with the next daily update.</p>
        )}
      </div>
      {!!progress?.findings.length && (
        <div className="flex flex-col gap-2.5">
          <div className="eyebrow">Found so far</div>
          {progress.findings.map((f) => (
            <FindingRow key={`${f.opponent}-${f.played_at}-${f.move_number}-${f.color}`} finding={f} />
          ))}
        </div>
      )}
    </>
  )
}

/** One mistake the analysis found: its badge, the move and the better one, the game. */
export function FindingRow({ finding: f }: { finding: Onboarding['findings'][number] }) {
  const move = `${f.move_number}${f.color === 'black' ? '…' : '. '}${f.san}`
  const what = f.classification === 'miss' ? `${move} missed ${f.best_san}.` : `${move} was a ${f.classification}. ${f.best_san} was better.`
  const when = f.played_at ? new Date(f.played_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null
  return (
    <div className="panel flex animate-rise items-center gap-3.5 px-4 py-3">
      <MoveBadge kind={f.classification} className="size-7 text-sm" />
      <div className="min-w-0 flex-1">
        <div className="font-extrabold">{what}</div>
        <div className="text-sm text-muted-foreground">
          {[f.opponent && `vs ${f.opponent}`, when].filter(Boolean).join(' · ')}
        </div>
      </div>
    </div>
  )
}

function Ready({ progress: p }: { progress: Onboarding }) {
  const s = p.summary
  const pattern = patternOf(s.pattern)
  const rest = p.games - p.analysed
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <KnIcon glyph="trophy" className="size-24 animate-bounce-in" />
      <h1 className="text-3xl font-bold">Your first lesson is ready</h1>
      <p className="max-w-md text-lg text-muted-foreground">
        In your newest {p.analysed} games: {s.blunders} blunders, {s.mistakes} mistakes and {s.misses} missed chances.
        {pattern && ` ${pattern.label} come up most, so that's where your path starts.`}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Badge variant="sky">{s.positions} positions to practise</Badge>
        {rest > 0 && <Badge variant="secondary">{rest} older games on the way</Badge>}
      </div>
    </div>
  )
}
