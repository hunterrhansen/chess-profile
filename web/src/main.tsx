import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AppShell } from '@/components/app-shell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { GamesPage } from '@/pages/games'
import { PreferencesProvider } from '@/lib/preferences'
import { OverviewPage } from '@/pages/overview'
import { PlayPage } from '@/pages/play'
import { ReviewPage } from '@/pages/review'
import { SettingsPage } from '@/pages/settings'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <PreferencesProvider>
        <TooltipProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<OverviewPage />} />
              <Route path="games" element={<GamesPage />} />
              <Route path="games/:id" element={<ReviewPage />} />
              <Route path="play" element={<PlayPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </TooltipProvider>
      </PreferencesProvider>
    </BrowserRouter>
  </StrictMode>,
)
