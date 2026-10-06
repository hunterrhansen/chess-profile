import { ChartLine, ChessKnight, ListChecks, Settings } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { useApi } from '@/lib/api'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/', label: 'Overview', icon: ChartLine },
  { to: '/games', label: 'Games', icon: ListChecks },
]

const SOURCE_LABEL: Record<string, string> = { chesscom: 'Chess.com', lichess: 'Lichess' }

/**
 * Left sidebar like Chess.com's: brand, navigation, accounts at the bottom.
 * Collapses to an icon rail below the md breakpoint.
 */
export function AppShell() {
  const { data: accounts } = useApi<{ source: string; handle: string }[]>('/api/accounts')

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <aside className="sticky top-0 flex h-svh w-16 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:w-56">
        <div className="flex h-16 items-center gap-2.5 px-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <ChessKnight className="size-5" strokeWidth={2.25} />
          </span>
          <span className="hidden text-lg font-semibold tracking-tight md:block">Chess profile</span>
        </div>

        <nav className="flex flex-col gap-1 px-2 pt-2">
          {NAV.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>

        <div className="mt-auto px-2 pb-2">
          <NavItem to="/settings" label="Settings" icon={Settings} />
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
                <span className="hidden min-w-0 flex-col leading-tight md:flex">
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

function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Settings }) {
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
      <span className="hidden md:inline">{label}</span>
    </NavLink>
  )
}
