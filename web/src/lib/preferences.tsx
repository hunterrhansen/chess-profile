import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import type { Range } from './api'

/** Per-browser display preferences, kept in localStorage (the server never sees them). */
export interface Preferences {
  theme: 'system' | 'light' | 'dark'
  board: keyof typeof BOARDS
  bestArrow: 'auto' | 'request'
  overviewRange: Range
  sidebarCollapsed: boolean
}

export const BOARDS = {
  brown: { label: 'Brown', light: '#EDD6B0', dark: '#B88762', lightHl: '#F6EB72', darkHl: '#DDC34B' },
  green: { label: 'Green', light: '#EEEED2', dark: '#769656', lightHl: '#F6F669', darkHl: '#BACA2B' },
  blue: { label: 'Blue', light: '#DEE3E6', dark: '#8CA2AD', lightHl: '#CDD26A', darkHl: '#AAA23A' },
} as const

const DEFAULTS: Preferences = {
  theme: 'system',
  board: 'brown',
  bestArrow: 'auto',
  overviewRange: '90d',
  sidebarCollapsed: false,
}
const KEY = 'chessprofile.preferences'

function load(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    const prefs = { ...DEFAULTS, ...saved }
    return prefs.board in BOARDS ? prefs : { ...prefs, board: DEFAULTS.board }
  } catch {
    return DEFAULTS // storage blocked or corrupt: defaults still render correctly
  }
}

const Context = createContext<{ prefs: Preferences; set: (patch: Partial<Preferences>) => void } | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState(load)

  const set = (patch: Partial<Preferences>) =>
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // still applies for this session
      }
      return next
    })

  // Theme: an explicit choice wins; "system" follows the OS and its live changes.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () =>
      document.documentElement.classList.toggle(
        'dark',
        prefs.theme === 'dark' || (prefs.theme === 'system' && media.matches),
      )
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [prefs.theme])

  return <Context.Provider value={{ prefs, set }}>{children}</Context.Provider>
}

export function usePreferences() {
  const ctx = useContext(Context)
  if (!ctx) throw new Error('usePreferences needs a PreferencesProvider')
  return ctx
}
