import { useEffect, useState } from 'react'

export type Range = '30d' | '90d' | 'all'
export type Outcome = 'win' | 'loss' | 'draw'

export interface Game {
  id: number
  played_at: string
  speed: string | null
  rated: boolean
  time_control: string | null
  url: string | null
  color: 'white' | 'black' | null
  outcome: Outcome | null
  rating: number | null
  opponent: string | null
  opponent_rating: number | null
  eco: string | null
  opening: string | null
  ended_by: string | null
  moves: number | null
  analysed: boolean
  accuracy: number | null
  blunders: number | null
  mistakes: number | null
  inaccuracies: number | null
}

export interface Kpis {
  blunders_per_game: number | null
  conversion: number | null
  winning_games: number
  thrown: number
  punish_rate: number | null
  opp_blunders: number
  accuracy: number | null
  opening_edge: number | null // centipawns, user POV
  comeback_rate: number | null
  lost_games: number
  analysed: number
}

export interface KpiPoint {
  period: string
  blunders_per_game: number | null
  conversion: number | null
  punish_rate: number | null
  accuracy: number | null
}

export interface Overview {
  range: Range
  start: string | null
  end: string
  rating: { current: number | null; change: number | null; best: number | null }
  games_played: number
  games_per_week: number
  games_analysed: number
  rating_series: {
    id: number
    played_at: string
    rating: number
    outcome: Outcome
    opponent: string
    opponent_rating: number | null
  }[]
  kpis: Kpis
  previous_kpis: Kpis | null
  kpi_series: KpiPoint[]
  recent_games: Game[]
  top_openings: { eco: string; opening: string | null; color: 'white' | 'black'; games: number; win_rate: number }[]
}

export interface GamesPage {
  total: number
  page: number
  page_size: number
  win_rate: number | null
  accuracy: number | null
  games: Game[]
}

/** GET a JSON endpoint, refetching whenever `url` changes. Keeps the previous data while loading. */
export function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
        return res.json() as Promise<T>
      })
      .then((json) => {
        setData(json)
        setError(null)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return
        setError(err.message)
        setLoading(false)
      })
    return () => ctrl.abort()
  }, [url])

  return { data, error, loading }
}

export type Classification = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'miss'

/** One half-move of an analysed game. Win% values are from the mover's point of view. */
export interface MoveRow {
  ply: number
  color: 'white' | 'black'
  is_user: number | null
  san: string
  uci: string
  best_san: string | null
  best_uci: string | null
  eval_after: number | null
  mate_after: number | null
  win_pct_before: number | null
  win_pct_after: number | null
  classification: Classification | null
  clock_left: number | null
  time_spent: number | null
}

export interface GameDetail extends Game {
  account: string | null
  white: string
  black: string
  white_elo: number | null
  black_elo: number | null
  start_fen: string | null
  san: string[]
  engine_accuracy: number | null
  opponent_accuracy: number | null
  plies: MoveRow[] // empty until the game has been analysed
}
