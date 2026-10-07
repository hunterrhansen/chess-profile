import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { IconContext } from '@phosphor-icons/react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AppShell } from '@/components/app-shell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { GamesPage } from '@/pages/games'
import { PreferencesProvider } from '@/lib/preferences'
import { ProgressPage } from '@/pages/overview'
import { PlayPage } from '@/pages/play'
import { PracticePage } from '@/pages/practice'
import { ReviewPage } from '@/pages/review'
import { SettingsPage } from '@/pages/settings'
import { StyleguidePage } from '@/pages/styleguide'
import './index.css'

// The app was called "chessprofile" until October 2026: move this browser's saved settings
// (board, theme, last page, a game in progress) to their new keys once, before anything reads them.
try {
  for (const old of Object.keys(localStorage).filter((k) => k.startsWith('chessprofile.'))) {
    const key = `knightly.${old.slice('chessprofile.'.length)}`
    if (localStorage.getItem(key) === null) localStorage.setItem(key, localStorage.getItem(old)!)
    localStorage.removeItem(old)
  }
} catch {
  // storage blocked: nothing to move
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <PreferencesProvider>
        <IconContext.Provider value={{ weight: 'bold' }}>
          <TooltipProvider>
            <Routes>
              <Route element={<AppShell />}>
                {/* Home (today's goal and the path) will live here; until then, Progress. */}
                <Route index element={<Navigate to="/progress" replace />} />
                <Route path="progress" element={<ProgressPage />} />
                <Route path="games" element={<GamesPage />} />
                <Route path="games/:id" element={<ReviewPage />} />
                <Route path="play" element={<PlayPage />} />
                <Route path="practice" element={<PracticePage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="styleguide" element={<StyleguidePage />} />
              </Route>
            </Routes>
          </TooltipProvider>
        </IconContext.Provider>
      </PreferencesProvider>
    </BrowserRouter>
  </StrictMode>,
)
