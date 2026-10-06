import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AppShell } from '@/components/app-shell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { GamesPage } from '@/pages/games'
import { OverviewPage } from '@/pages/overview'
import { ReviewPage } from '@/pages/review'
import './index.css'

// Follow the OS light/dark setting (shadcn themes key off the `dark` class).
const dark = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => document.documentElement.classList.toggle('dark', dark.matches)
applyTheme()
dark.addEventListener('change', applyTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TooltipProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<OverviewPage />} />
            <Route path="games" element={<GamesPage />} />
            <Route path="games/:id" element={<ReviewPage />} />
          </Route>
        </Routes>
      </TooltipProvider>
    </BrowserRouter>
  </StrictMode>,
)
