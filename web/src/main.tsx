import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AppShell } from '@/components/app-shell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { GamesPage } from '@/pages/games'
import { PreferencesProvider } from '@/lib/preferences'
import { OverviewPage } from '@/pages/overview'
import { ReviewPage } from '@/pages/review'
import { SettingsPage } from '@/pages/settings'
import { StyleguidePage } from '@/pages/styleguide'
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
              <Route path="settings" element={<SettingsPage />} />
              <Route path="styleguide" element={<StyleguidePage />} />
            </Route>
          </Routes>
        </TooltipProvider>
      </PreferencesProvider>
    </BrowserRouter>
  </StrictMode>,
)
