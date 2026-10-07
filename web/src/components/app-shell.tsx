import { SidebarSimpleIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, Outlet, useLocation } from 'react-router'
import { type Glyph, KnIcon } from '@/components/kn-icon'
import { LogoMark } from '@/components/logo'
import { useApi } from '@/lib/api'
import { lastLocation, rememberLocation, type Section, sectionsOf } from '@/lib/last-location'
import { usePreferences } from '@/lib/preferences'
import { cn } from '@/lib/utils'

interface Tab {
  section: Section
  root: string
  label: string
  glyph: Glyph
}
// Practice isn't a tab: it's a lesson you start from Home (or Progress), full screen.
const NAV: Tab[] = [
  { section: 'home', root: '/', label: 'Home', glyph: 'home' },
  { section: 'games', root: '/games', label: 'Games', glyph: 'games' },
  { section: 'play', root: '/play', label: 'Play', glyph: 'play' },
  { section: 'progress', root: '/progress', label: 'Progress', glyph: 'progress' },
]
const SETTINGS: Tab = { section: 'settings', root: '/settings', label: 'Settings', glyph: 'settings' }

/** The phone top bar's slot for page content, filled with `PhoneHeader`. */
export const PHONE_HEADER_SLOT = 'phone-header-slot'

/** Puts `children` in the phone top bar, beside Settings, while the page is shown. */
export function PhoneHeader({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useEffect(() => setSlot(document.getElementById(PHONE_HEADER_SLOT)), [])
  return slot ? createPortal(children, slot) : null
}

const SOURCE_LABEL: Record<string, string> = { chesscom: 'Chess.com', lichess: 'Lichess' }

/**
 * From md up, a left sidebar like Chess.com's: brand, the tabs and Settings, then collapse and
 * accounts at the bottom. Collapsed (the "Collapse" button or ⌘B / Ctrl+B; remembered per
 * browser) it's an icon rail. On a phone: a top bar with Settings, and the tabs along the bottom.
 */
export function AppShell() {
  const { data: accounts } = useApi<{ source: string; handle: string }[]>('/api/accounts')
  const { prefs, set } = usePreferences()
  const collapsed = prefs.sidebarCollapsed
  const toggle = () => set({ sidebarCollapsed: !collapsed })

  // Remember where you are in each section, so its tab brings you back here later.
  const location = useLocation()
  useEffect(() => rememberLocation(location.pathname, location.search), [location.pathname, location.search])
  const here = sectionsOf(location.pathname)
  /** A tab returns you to where you left that section; inside it, it goes up a level
   * (from a game review back to the list as you left it). */
  const target = (section: Section, root: string) =>
    here.includes(section)
      ? section === 'games' && location.pathname !== '/games'
        ? lastLocation('games-list', root)
        : location.pathname + location.search
      : lastLocation(section, root)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'b') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
        e.preventDefault()
        set({ sidebarCollapsed: !collapsed })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [collapsed, set])

  // Text next to icons unless collapsed to the rail.
  const label = collapsed ? 'hidden' : 'inline'

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <aside
        className={cn(
          'sticky top-0 hidden h-svh w-20 shrink-0 flex-col border-r-2 bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex',
          !collapsed && 'md:w-60',
        )}
      >
        <div className="flex h-20 items-center gap-2.5 px-6">
          <LogoMark />
          <span className={cn('truncate font-display text-2xl leading-none font-bold tracking-tight text-brand-text', label)}>
            Knightly
          </span>
        </div>

        <nav aria-label="Main" className="flex flex-col gap-1.5 px-2.5 pt-2">
          {[...NAV, SETTINGS].map((item) => (
            <NavItem
              key={item.section}
              to={target(item.section, item.root)}
              active={here.includes(item.section)}
              label={item.label}
              glyph={item.glyph}
              labelClass={label}
            />
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-1 px-2.5 pb-2">
          <button
            onClick={toggle}
            title={collapsed ? 'Expand sidebar (⌘B)' : 'Collapse sidebar (⌘B)'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className="flex h-11 w-full items-center gap-3.5 rounded-md px-[18px] text-[15px] font-bold text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <SidebarSimpleIcon className="size-6 shrink-0" />
            <span className={label}>Collapse</span>
          </button>
        </div>

        {!!accounts?.length && (
          <div className="flex flex-col gap-1 border-t px-2 py-3">
            {accounts.map((a) => (
              <div
                key={`${a.source}-${a.handle}`}
                title={`${SOURCE_LABEL[a.source] ?? a.source}: ${a.handle}`}
                className="flex h-10 items-center gap-3 rounded-md px-3 text-sm"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-[11px] font-semibold uppercase">
                  {a.handle[0]}
                </span>
                <span className={cn('min-w-0 flex-col leading-tight', collapsed ? 'hidden' : 'flex')}>
                  <span className="truncate font-medium">{a.handle}</span>
                  <span className="text-xs text-sidebar-foreground/60">{SOURCE_LABEL[a.source] ?? a.source}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b-2 bg-card px-3 md:hidden">
          <LogoMark className="size-7" />
          <span className="font-display text-xl font-bold text-brand-text">Knightly</span>
          {/* Pages can put a little here (Home: today's goal counters). */}
          <div id={PHONE_HEADER_SLOT} className="ml-auto flex items-center" />
          <Link
            to={target(SETTINGS.section, SETTINGS.root)}
            aria-label="Settings"
            aria-current={here.includes('settings') ? 'page' : undefined}
            className="grid size-11 place-items-center rounded-md aria-[current=page]:bg-sky/15"
          >
            <KnIcon glyph="settings" className="size-[26px]" />
          </Link>
        </header>

        <main className="min-w-0 flex-1 pb-24 md:pb-0">
          <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
            <Outlet />
          </div>
        </main>

        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 gap-1 border-t-2 bg-card px-2 pt-1.5 pb-[max(10px,env(safe-area-inset-bottom))] md:hidden"
        >
          {NAV.map((item) => {
            const active = here.includes(item.section)
            return (
              <Link
                key={item.section}
                to={target(item.section, item.root)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] font-extrabold tracking-[.05em] text-muted-foreground uppercase',
                  active && 'bg-sky/14 text-foreground shadow-[inset_0_0_0_2px_var(--sky)]',
                )}
              >
                <KnIcon glyph={item.glyph} className="size-[30px]" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

/** A sidebar tab: the brand icon and an uppercase label; the current one is outlined in sky. */
function NavItem({ to, active, label, glyph, labelClass }: { to: string; active: boolean; label: string; glyph: Glyph; labelClass: string }) {
  return (
    <Link
      to={to}
      title={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-[52px] items-center gap-3.5 rounded-[14px] border-2 border-transparent px-[11px] text-[15px] font-extrabold tracking-[.04em] text-muted-foreground uppercase transition-colors hover:bg-sidebar-accent hover:text-foreground',
        active && 'border-sky bg-sky/12 text-foreground hover:bg-sky/12',
      )}
    >
      <KnIcon glyph={glyph} />
      <span className={labelClass}>{label}</span>
    </Link>
  )
}

/** For lessons (Practice): no sidebar or tabs, just the page, which brings its own ✕. */
export function FocusShell() {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <Outlet />
      </div>
    </main>
  )
}
