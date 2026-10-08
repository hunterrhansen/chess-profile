import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { IconContext } from '@phosphor-icons/react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AppShell, FocusShell } from '@/components/app-shell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { GamesPage } from '@/pages/games'
import { HomePage } from '@/pages/home'
import { AuthProvider } from '@/lib/auth'
import { PreferencesProvider } from '@/lib/preferences'
import { ProgressPage } from '@/pages/overview'
import { PlayPage } from '@/pages/play'
import { PracticePage } from '@/pages/practice'
import { PuzzlesPage } from '@/pages/puzzles'
import { ReviewPage } from '@/pages/review'
import { ReviewDonePage } from '@/pages/review-done'
import { AllMovesPage } from '@/pages/review-moves'
import { SettingsPage } from '@/pages/settings'
import { StyleguidePage } from '@/pages/styleguide'
import { WelcomePage } from '@/pages/welcome'
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
            <AuthProvider>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<HomePage />} />
                  <Route path="progress" element={<ProgressPage />} />
                  <Route path="games" element={<GamesPage />} />
                  <Route path="play" element={<PlayPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="styleguide" element={<StyleguidePage />} />
                </Route>
                {/* Lessons, not places: full screen, no navigation; ✕ goes back where you came from.
                    A game's review is one too, with All moves and Review complete beside it. */}
                <Route element={<FocusShell />}>
                  <Route path="practice" element={<PracticePage />} />
                  <Route path="puzzles" element={<PuzzlesPage />} />
                  <Route path="games/:id" element={<ReviewPage />} />
                  <Route path="games/:id/moves" element={<AllMovesPage />} />
                  <Route path="games/:id/done" element={<ReviewDonePage />} />
                  <Route path="welcome" element={<WelcomePage />} />
                </Route>
              </Routes>
            </AuthProvider>
          </TooltipProvider>
        </IconContext.Provider>
      </PreferencesProvider>
    </BrowserRouter>
  </StrictMode>,
)
