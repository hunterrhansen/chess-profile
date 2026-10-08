import { Chess } from 'chess.js'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch, type EngineLines, type GameDetail, type LineKind, type MoveRow } from '@/lib/api'

export type Side = 'white' | 'black'

export type Replay = NonNullable<ReturnType<typeof useReplay>>

/** Everything derived from the game once: positions, last-move squares, win%s, clocks. */
export function useReplay(game: GameDetail | null) {
  return useMemo(() => {
    if (!game) return null
    const chess = new Chess(game.start_fen ?? undefined)
    const fens = [chess.fen()]
    const squares: { from: string; to: string }[] = []
    for (const san of game.san) {
      try {
        const m = chess.move(san)
        fens.push(chess.fen())
        squares.push({ from: m.from, to: m.to })
      } catch {
        break // stop at anything chess.js can't play rather than show a wrong position
      }
    }
    const moves = game.plies.length === squares.length ? game.plies : []
    // White's win% after each ply (index 0 = start position).
    const whiteWin = [moves[0]?.win_pct_before ?? 50]
    for (const m of moves) {
      const wa = m.win_pct_after ?? 50
      whiteWin.push(m.color === 'white' ? wa : 100 - wa)
    }
    const [base] = (game.time_control ?? '').split('+').map(Number)
    return { fens, squares, moves, whiteWin, baseClock: Number.isFinite(base) && base > 0 ? base : null }
  }, [game])
}

/** "Why" / "Best line" for one move, fetched the first time it's asked for, then kept. */
export function useEngineLines(gameId: string | number | undefined, ply: number | null) {
  const [cache, setCache] = useState<Record<number, { data?: EngineLines; error?: string }>>({})
  const entry = ply == null ? undefined : cache[ply]
  useEffect(() => {
    if (ply == null || entry) return
    const ctrl = new AbortController()
    apiFetch(`/api/games/${gameId}/lines/${ply}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.detail ?? res.status)
        setCache((c) => ({ ...c, [ply]: { data: body } }))
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setCache((c) => ({ ...c, [ply]: { error: e.message } }))
      })
    return () => ctrl.abort()
  }, [gameId, ply, entry])
  return entry ?? null
}

/** An engine line for the move at `ply`, played out: positions and squares for each step. */
export function useLineView(gameId: string | number | undefined, ply: number, line: { kind: LineKind } | null) {
  const entry = useEngineLines(gameId, line ? ply : null)
  const view = useMemo(() => {
    const data = line && entry?.data?.[line.kind]
    if (!data) return null
    const chess = new Chess(data.start_fen)
    const fens = [chess.fen()]
    const squares: { from: string; to: string }[] = []
    for (const uci of data.moves) {
      const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
      fens.push(chess.fen())
      squares.push({ from: m.from, to: m.to })
    }
    return { data, fens, squares, firstPly: data.kind === 'best' ? ply : ply + 1 }
  }, [line, entry, ply])
  return { view, error: entry?.error ?? null }
}

/** Seconds left on `side`'s clock after `ply` half-moves, from the last clock it recorded. */
export function clockAt(moves: MoveRow[], side: Side, ply: number, base: number | null) {
  let left = base
  for (const m of moves.slice(0, ply)) if (m.color === side && m.clock_left != null) left = m.clock_left
  return left
}

/** "Lost on time", "Won by checkmate", "Draw by repetition" from the outcome and ending. */
export function resultPhrase(outcome: GameDetail['outcome'], endedBy: string | null) {
  if (!outcome) return null
  if (outcome === 'draw') {
    const how: Record<string, string> = {
      'Time vs material': 'timeout vs insufficient material',
      Material: 'insufficient material',
    }
    return endedBy ? `Draw by ${how[endedBy] ?? endedBy.toLowerCase()}` : 'Draw'
  }
  const verb = outcome === 'win' ? 'Won' : 'Lost'
  const how: Record<string, string> = {
    Checkmate: 'by checkmate',
    Resigned: 'by resignation',
    Time: 'on time',
    Abandoned: 'by abandonment',
  }
  return endedBy ? `${verb} ${how[endedBy] ?? `· ${endedBy}`}` : verb
}
