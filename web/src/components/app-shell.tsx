import { ChartLine, ChessKnight, ListChecks, PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react'
import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useApi } from '@/lib/api'
import { usePreferences } from '@/lib/preferences'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/', label: 'Overview', icon: ChartLine },
  { to: '/games', label: 'Games', icon: ListChecks },
]

const SOURCE_LABEL: Record<string, string> = { chesscom: 'Chess.com', lichess: 'Lichess' }

/**
 * Left sidebar like Chess.com's: brand, navigation, then collapse, settings and accounts
 * at the bottom.
 * It's an icon rail below the md breakpoint, and on wider screens when collapsed
 * (the "Collapse" button or ⌘B / Ctrl+B; remembered per browser).
 */
export function AppShell() {
  const { data: accounts } = useApi<{ source: string; handle: string }[]>('/api/accounts')
  const { prefs, set } = usePreferences()
  const collapsed = prefs.sidebarCollapsed
  const toggle = () => set({ sidebarCollapsed: !collapsed })

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

  // Text next to icons: never on the narrow rail, otherwise from md up unless collapsed.
  const label = collapsed ? 'hidden' : 'hidden md:inline'

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <aside
        className={cn(
          'sticky top-0 flex h-svh w-16 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200',
          !collapsed && 'md:w-56',
        )}
      >
        <div className="flex h-16 items-center gap-2.5 px-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <ChessKnight className="size-5" strokeWidth={2.25} />
          </span>
          <span className={cn('truncate text-lg font-semibold tracking-tight', label)}>Chess profile</span>
        </div>

        <nav className="flex flex-col gap-1 px-2 pt-2">
          {NAV.map((item) => (
            <NavItem key={item.to} {...item} labelClass={label} />
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-1 px-2 pb-2">
          {/* Only offered where the full sidebar exists; the phone layout is always the rail. */}
          <button
            onClick={toggle}
            title={collapsed ? 'Expand sidebar (⌘B)' : 'Collapse sidebar (⌘B)'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className="hidden h-11 w-full items-center gap-3 rounded-md px-3 text-[15px] font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground md:flex"
          >
            {collapsed ? <PanelLeftOpen className="size-5 shrink-0" /> : <PanelLeftClose className="size-5 shrink-0" />}
            <span className={label}>Collapse</span>
          </button>
          <NavItem to="/settings" label="Settings" icon={Settings} labelClass={label} />
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
                <span className={cn('min-w-0 flex-col leading-tight', collapsed ? 'hidden' : 'hidden md:flex')}>
                  <span className="truncate font-medium">{a.handle}</span>
                  <span className="text-xs text-sidebar-foreground/60">{SOURCE_LABEL[a.source] ?? a.source}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function NavItem({
  to,
  label,
  icon: Icon,
  labelClass,
}: {
  to: string
  label: string
  icon: typeof Settings
  labelClass: string
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      title={label}
      className={({ isActive }) =>
        cn(
          'flex h-11 items-center gap-3 rounded-md px-3 text-[15px] font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground',
          isActive && 'bg-sidebar-accent text-sidebar-foreground',
        )
      }
    >
      <Icon className="size-5 shrink-0" />
      <span className={labelClass}>{label}</span>
    </NavLink>
  )
}
