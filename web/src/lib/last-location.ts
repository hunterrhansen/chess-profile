/**
 * Where you last were in each part of the app, so a sidebar tab (or "← Games") returns you
 * to the same game and move, or the same filtered list, instead of starting over. Kept for
 * the browser session; falls back to memory if storage is blocked.
 */
export type Section = 'overview' | 'practice' | 'games' | 'games-list' | 'play' | 'settings'

const KEY = 'chessprofile.lastLocation'
let memory: Partial<Record<Section, string>> = {}

function load(): Partial<Record<Section, string>> {
  try {
    return { ...memory, ...JSON.parse(sessionStorage.getItem(KEY) ?? '{}') }
  } catch {
    return memory
  }
}

/** The sections a path belongs to: a game review is in "games"; the list is in both. */
export function sectionsOf(pathname: string): Section[] {
  if (pathname === '/') return ['overview']
  if (pathname === '/games') return ['games', 'games-list']
  if (pathname.startsWith('/games/')) return ['games']
  if (pathname === '/practice') return ['practice']
  if (pathname === '/play') return ['play']
  if (pathname === '/settings') return ['settings']
  return []
}

export function rememberLocation(pathname: string, search: string) {
  const sections = sectionsOf(pathname)
  if (!sections.length) return
  const next = { ...load() }
  for (const s of sections) next[s] = pathname + search
  memory = next
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // memory copy still works for this tab
  }
}

export function lastLocation(section: Section, fallback: string) {
  return load()[section] ?? fallback
}
