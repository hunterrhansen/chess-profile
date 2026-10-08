import { CaretDownIcon, CaretUpIcon, CircleNotchIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { type AccountStatus as Status, send, useApi } from '@/lib/api'
import { cn } from '@/lib/utils'

const SITE: Record<string, { name: string; initial: string; tag: string }> = {
  chesscom: { name: 'Chess.com', initial: 'C', tag: 'bg-foreground text-background' },
  lichess: { name: 'Lichess', initial: 'L', tag: 'bg-sky text-on-sky' },
}
const STEP: Record<string, string> = { analyze: 'analysing', patterns: 'tagging tactics', backup: 'backing up' }

export type Tone = 'ok' | 'running' | 'idle' | 'partial' | 'failed'
const DOT: Record<Tone, string> = {
  ok: 'bg-brand',
  running: 'bg-sky animate-pulse',
  idle: 'bg-border',
  partial: 'bg-gold',
  failed: 'bg-danger',
}
const TEXT: Record<Tone, string> = {
  ok: 'text-muted-foreground',
  running: 'text-muted-foreground',
  idle: 'text-muted-foreground',
  partial: 'text-gold-text',
  failed: 'text-danger-text',
}

/** "today, 6:00 AM", "yesterday, 6:00 AM", or "Oct 5". */
function when(iso: string) {
  const d = new Date(iso)
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const ago = Math.round((day(new Date()) - day(d)) / 86_400_000)
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (ago === 0) return `today, ${time}`
  if (ago === 1) return `yesterday, ${time}`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** The daily update in one line, with a tone for its dot: quiet when all is well. */
function summary(s: Status): { tone: Tone; line: string; short: string; detail: string | null } {
  const run = s.current_run
  if (run) {
    const step = run.progress?.current ?? ''
    const what = step.startsWith('sync:') ? `syncing ${SITE[step.split(':')[1]]?.name ?? 'accounts'}` : (STEP[step] ?? 'starting')
    return { tone: 'running', line: `Updating: ${run.progress?.detail ?? what}`, short: 'Updating…', detail: `Started ${when(run.started_at)}` }
  }
  const last = s.last_run
  if (!last) return { tone: 'idle', line: 'Not synced yet', short: 'Not synced yet', detail: 'Run an update to bring your games in.' }
  const at = when(last.finished_at ?? last.started_at)
  const counts = `${last.new_games ?? 0} new game${last.new_games === 1 ? '' : 's'}${last.games_analysed ? `, ${last.games_analysed === last.new_games ? 'all' : last.games_analysed} analysed` : ''}`
  if (last.status === 'failed') return { tone: 'failed', line: 'Update failed', short: 'Update failed', detail: last.errors[0] ?? `Failed ${at}` }
  if (last.status === 'partial') return { tone: 'partial', line: 'Synced, with problems', short: 'Synced, with problems', detail: last.errors[0] ?? counts }
  const today = at.startsWith('today')
  // The row is narrow: "Synced 6:15 AM" today, "Synced yesterday" or "Synced Oct 5" before.
  const short = today ? `Synced ${at.slice('today, '.length)}` : `Synced ${at.split(',')[0]}`
  return { tone: today ? 'ok' : 'idle', line: `${today ? 'Synced' : 'Last synced'} ${at}`, short, detail: counts }
}

/**
 * The sidebar's account row: your avatar wearing a tag per site, your name, and the daily
 * update's status under it (a dot and a line). Click it for the update with Run now, each
 * account with its rating, and Manage accounts. Collapsed to the icon rail: the avatar with
 * the dot. Follows a running update every few seconds, like Settings.
 */
export function AccountStatus({ collapsed }: { collapsed: boolean }) {
  const { data, reload } = useApi<Status>('/api/status')
  const [open, setOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const running = !!data?.current_run

  useEffect(() => {
    const t = setInterval(reload, running ? 4000 : 300_000)
    const onFocus = () => reload()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [running, reload])

  if (!data?.accounts.length) return null
  const s = summary(data)
  const name = data.accounts[0].handle
  const runNow = async () => {
    setStarting(true)
    try {
      await send('POST', '/api/update/run')
      setTimeout(reload, 1500)
    } finally {
      setStarting(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={`${name}: ${s.line}. Accounts and the daily update`}
          title={collapsed ? `${name}: ${s.line}` : undefined}
          className={cn(
            'flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2 text-left transition-colors hover:bg-sidebar-accent',
            open && 'bg-sky/14 hover:bg-sky/14',
            collapsed && 'justify-center px-0',
          )}
        >
          <AccountRow name={name} sources={data.accounts.map((a) => a.source)} tone={s.tone} line={s.short} collapsed={collapsed} />
          {!collapsed &&
            (open ? <CaretUpIcon className="size-3.5 text-muted-foreground" /> : <CaretDownIcon className="size-3.5 text-muted-foreground" />)}
        </button>
      </PopoverTrigger>
      <PopoverContent side={collapsed ? 'right' : 'top'} align={collapsed ? 'end' : 'start'} className="panel w-72 gap-1 p-2">
        <div className={cn('flex items-center gap-2.5 rounded-lg p-2', s.tone === 'ok' ? 'bg-brand/12' : s.tone === 'failed' ? 'bg-danger/12' : s.tone === 'partial' ? 'bg-gold/15' : 'bg-muted')}>
          <span className={cn('size-3 shrink-0 rounded-full', DOT[s.tone])} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className={cn('block text-[13px] font-extrabold', s.tone === 'failed' ? 'text-danger-text' : s.tone === 'partial' ? 'text-gold-text' : '')}>
              {s.line}
            </span>
            {s.detail && <span className="block truncate text-[11px] text-muted-foreground" title={s.detail}>{s.detail}</span>}
          </span>
          {!running && (
            <Button size="sm" variant="outline" className="h-8 px-2 text-[11px]" onClick={runNow} disabled={starting}>
              {starting && <CircleNotchIcon className="animate-spin" />}
              Run now
            </Button>
          )}
        </div>
        {data.accounts.map((a) => (
          <div key={`${a.source}-${a.handle}`} className="flex items-center gap-2.5 rounded-lg p-2">
            <SiteTag source={a.source} className="size-7 rounded-lg text-[13px]" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-sm font-extrabold">{SITE[a.source]?.name ?? a.source}</span>
              <span className="block truncate text-xs text-muted-foreground">{a.handle}</span>
            </span>
            {a.rating != null && (
              <span className="text-right leading-tight">
                <span className="block font-heading text-lg font-bold tabular-nums">{a.rating}</span>
                <span className="block text-[11px] text-muted-foreground">{a.rating_kind}</span>
              </span>
            )}
          </div>
        ))}
        <Link
          to="/settings"
          onClick={() => setOpen(false)}
          className="mt-1 border-t-2 px-2 pt-2.5 pb-1 text-sm font-extrabold text-brand-text hover:underline"
        >
          Manage accounts
        </Link>
      </PopoverContent>
    </Popover>
  )
}

/** You and the daily update: the avatar wearing a tag per site, your name, and the update's
 * status as a dot and a short line. Collapsed (the icon rail), only the avatar, the dot on it. */
export function AccountRow({
  name,
  sources,
  tone,
  line,
  collapsed,
}: {
  name: string
  sources: string[]
  tone: Tone
  line: string
  collapsed?: boolean
}) {
  return (
    <>
      <Avatar initial={name[0]} sources={sources} dot={collapsed ? tone : null} />
      {!collapsed && (
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate font-extrabold">{name}</span>
          <span className={cn('flex items-center gap-1.5 text-xs', TEXT[tone])}>
            <span className={cn('size-2 shrink-0 rounded-full', DOT[tone])} />
            <span className="truncate">{line}</span>
          </span>
        </span>
      )}
    </>
  )
}

function SiteTag({ source, className }: { source: string; className?: string }) {
  const site = SITE[source] ?? { initial: source[0], tag: 'bg-muted text-foreground' }
  return (
    <span aria-hidden className={cn('grid shrink-0 place-items-center font-black uppercase', site.tag, className)}>
      {site.initial}
    </span>
  )
}

/** Your initial on a brand disc, wearing a small tag per site; on the rail, the status dot. */
export function Avatar({ initial, sources, dot }: { initial: string; sources: string[]; dot: Tone | null }) {
  return (
    <span className="relative size-10 shrink-0">
      <span className="grid size-10 place-items-center rounded-full bg-brand font-heading text-lg font-bold text-on-brand uppercase shadow-[inset_0_-3px_0_var(--brand-lip)]">
        {initial}
      </span>
      <span className="absolute -right-1.5 -bottom-1 flex">
        {sources.map((s) => (
          <SiteTag key={s} source={s} className="-ml-1 size-4 rounded-[5px] text-[9px] shadow-[0_0_0_2px_var(--sidebar)]" />
        ))}
      </span>
      {dot && <span className={cn('absolute -top-0.5 -right-0.5 size-3 rounded-full shadow-[0_0_0_2px_var(--sidebar)]', DOT[dot])} />}
    </span>
  )
}
