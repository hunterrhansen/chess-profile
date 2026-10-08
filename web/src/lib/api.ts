import type { StepMark } from '@/lib/key-moments'
import { useCallback, useEffect, useState } from 'react'

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
  reviewed_at: string | null // when "Finish review" was last pressed
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

/** The review deck (deck.py): counts, today's progress and the next card, if any. */
export interface DeckToday {
  total: number
  mastered: number
  learning: number
  new: number
  kinds: { mistake: number; miss: number; blunder: number } // what the cards were in your games
  today: { done: number; total: number }
  /** Today's answers in order (a card's first of the day), for the Done screen. */
  results: { game_id: number; ply: number; correct: boolean; mark: PracticeMark; san: string; opponent: string | null }[]
  card: DeckCard | null
}

export interface DeckCard {
  game_id: number
  ply: number
  pattern: string | null // the tactic behind it (patterns.py); shown only after you answer
  reviews: number // 0: you haven't seen this position yet
  fen_before: string
  color: 'white' | 'black' // who moved: you
  san: string // what you played
  uci: string
  move_number: number
  classification: Classification
  win_pct_before: number | null
  prev_uci: string | null // the opponent's move that led here
  opponent: string | null
  played_at: string
  time_control: string | null
  speed: string | null
  user_outcome: Outcome | null
}

/** How a position went (deck.mark): found first try, a good move that wasn't the best,
 * found with help (a retry or a hint), or missed. */
export type PracticeMark = 'found' | 'good' | 'helped' | 'missed'

/** A checked answer (deck.answer). `rating` is the Anki grade FSRS got, set only by the day's
 * first try; retries and the end-of-session redo come back with null. */
export interface DeckAnswer {
  correct: boolean
  quality: 'best' | 'excellent' | 'good' | 'wrong' | 'shown'
  rating: 'again' | 'hard' | 'good' | null
  best_uci: string
  best_san: string
  mastered: boolean
  due: string | null // YYYY-MM-DD of the next review
}

export interface GamesPage {
  total: number
  page: number
  page_size: number
  /** Each quick filter's number, for the list as narrowed by search and Filters. */
  counts: { all: number; to_review: number; wins: number; losses: number; blunders: number; thrown: number }
  games: Game[]
}

/** GET a JSON endpoint, refetching whenever `url` changes. Keeps the previous data while loading. */
export function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)

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
  }, [url, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { data, error, loading, reload }
}

/** POST / PUT / DELETE a JSON body; throws with the server's message on failure. */
export async function send<T = unknown>(method: 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    let message = `${res.status}`
    try {
      const err = await res.json()
      message = typeof err.detail === 'string' ? err.detail : (err.detail?.[0]?.msg ?? message)
    } catch {
      // not JSON
    }
    throw new Error(message)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

/** Live step-by-step state of an update run (see update.Progress). */
export interface RunProgress {
  plan: string[] // "sync:<source>:<handle>", "analyze", "backup"
  current: string | null
  detail: string | null
  done: { key: string; summary: string | null; error: string | null }[]
}

export interface Settings {
  accounts: { source: string; handle: string; synced_through: string | null }[]
  lichess_token: boolean
  schedule: { hour: number; minute: number; loaded: boolean } | null
  last_run: {
    started_at: string
    finished_at: string | null
    status: 'ok' | 'partial' | 'failed'
    trigger: string | null
    new_games: number | null
    new_puzzles: number | null
    games_analysed: number | null
    errors: string[]
    progress: RunProgress | null
  } | null
  /** Up to three runs before the last one, newest first. */
  earlier_runs: Omit<NonNullable<Settings['last_run']>, 'progress'>[]
  current_run: { id: number; started_at: string; trigger: string | null; progress: RunProgress | null } | null
  running: boolean
  engine: string | null
  depth: number
  database: { path: string; bytes: number; games: number; analysed: number }
  backups: { dir: string; count: number; keep: number }
}

export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'miss'

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

export type LineKind = 'why' | 'best'

/** An engine line for game review's "Why" / "Best line" (see lines.py). */
export interface EngineLine {
  kind: LineKind
  start_fen: string
  moves: string[] // UCI
  san: string[]
  win_pct: number | null // the reviewed move's mover's win chance at the end of the line
  mate: number | null
  summary: string | null
}

export type EngineLines = Partial<Record<LineKind, EngineLine>>

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
  deck_plies: number[] // your moves from this game that are (or will be) in the review deck
  review_marks: { ply: number; mark: StepMark }[] // how each lesson step went, last time it was finished
}

/** A unit on Home's path (units.py): one KPI, its target, and the unit check over your last
 * 10 games that count for it. */
export interface Unit {
  id: 'blunders' | 'conversion' | 'punish' | 'comebacks'
  title: string
  kpi: string
  value: number | null // over the last 90 days, as on Progress
  target: number
  lower_better: boolean
  done: boolean
  check: { size: number; games: number; hits: number; value: number | null }
}

export interface Home {
  units: Unit[] // path order: weakest unfinished first, finished last
  today: {
    game: (Game & { fits_unit: boolean }) | null // the game to review today, if there's a new one
    new_games: number
    reviewed_today: number
    positions: { done: number; total: number }
    deck_total: number
    /** Lichess puzzles for your most common tactic (puzzles.py). */
    puzzles: { theme: string | null; share: number | null; done: number; session: number; available: boolean }
  }
}

/** What your mistakes come down to (GET /api/patterns): most common tactic first, "other" last. */
export interface PatternCounts {
  range: Range
  patterns: { pattern: string; total: number; blunder: number; mistake: number; miss: number }[]
  pending: number // tagged once the daily update has looked deeper
}

/** A Lichess puzzle (puzzles.py): moves[0] is the opponent's setting-up move, yours follow. */
export interface Puzzle {
  id: string
  fen: string
  moves: string[]
  rating: number
  themes: string[]
  url: string | null
}

export interface PuzzleNext {
  puzzle: Puzzle | null
  done_today: number
  session: number
  available: boolean
}
