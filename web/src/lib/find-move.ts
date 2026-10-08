import { Chess } from 'chess.js'
import { useEffect, useMemo, useState } from 'react'
import { type DeckAnswer, send } from '@/lib/api'
import { durationMs } from '@/lib/motion'
import { playSound } from '@/lib/sound'

/** No move: Show me. The server counts it as Again (and shows the answer). */
export const SKIP = '0000'
/** Hint waits this long after a position appears, so it isn't tapped by accident. */
const HINT_DELAY_MS = 2000

/** How finding a move went: first try (the best move or close to it), a good move that
 * wasn't the best, found with help (after a miss or a hint), or shown. */
export type FindOutcome = 'found' | 'good' | 'helped' | 'shown'

/**
 * "Find a better move" for one review-deck position (Practice, and the review lesson's find
 * steps). A wrong move slides back and you try again; Hint lights up the piece, then shows
 * the move as an arrow; Show me gives the answer. Only the first try is graded (deck.py:
 * Anki's grades, scheduled by FSRS); the rest is for learning. `redo` is the end-of-session
 * go at a position you missed, which the server never grades.
 */
export function useFindMove({ gameId, ply, fen, redo = false }: { gameId: number; ply: number; fen: string; redo?: boolean }) {
  const before = useMemo(() => new Chess(fen), [fen])
  const [selected, setSelected] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [misses, setMisses] = useState(0)
  const [wrongSquare, setWrongSquare] = useState<string | null>(null)
  const [hints, setHints] = useState(0) // 1: the piece is lit; 2: the arrow is shown
  const [hintMove, setHintMove] = useState<string | null>(null)
  const [hintReady, setHintReady] = useState(false)
  const [first, setFirst] = useState<DeckAnswer | null>(null) // the graded first answer
  const [outcome, setOutcome] = useState<FindOutcome | null>(null)
  const [played, setPlayed] = useState<string | null>(null) // your move, once it's right
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setHintReady(true), HINT_DELAY_MS)
    return () => clearTimeout(t)
  }, [])
  // The verdict's sound lands with the square's flash, after the piece.
  useEffect(() => {
    if (outcome) return playSound(outcome === 'shown' ? 'wrong' : 'right', durationMs('--duration-move'))
  }, [outcome])

  const submit = (uci: string) => {
    setChecking(true)
    setSelected(null)
    setError(null)
    const isFirst = !first
    send<DeckAnswer>('POST', '/api/deck/answer', { game_id: gameId, ply, uci, hinted: isFirst && hints > 0, redo })
      .then((r) => {
        if (isFirst) setFirst(r)
        if (uci === SKIP) setOutcome('shown')
        else if (r.correct) {
          setPlayed(uci)
          setOutcome(isFirst && hints === 0 ? (r.quality === 'good' ? 'good' : 'found') : 'helped')
        } else {
          setMisses((n) => n + 1)
          setWrongSquare(uci.slice(2, 4))
          playSound('wrong')
        }
      })
      .catch((e: Error) => setError(`Couldn't check that move. ${e.message}`))
      .finally(() => setChecking(false))
  }

  /** The board's onMove: send the move and let the piece slide back; a right answer is then
   * played from the start square, so it's seen moving. */
  const tryMove = (from: string, to: string) => {
    if (outcome || checking) return false
    try {
      const m = new Chess(fen).move({ from, to, promotion: 'q' })
      submit(m.from + m.to + (m.promotion ?? ''))
    } catch {
      // not a legal move: nothing to check
    }
    return false
  }

  const askHint = () => {
    if (hints >= 1) return setHints(2)
    send<{ best_uci: string }>('POST', '/api/deck/hint', { game_id: gameId, ply })
      .then((r) => {
        setHintMove(r.best_uci)
        setHints(1)
        setWrongSquare(null)
      })
      .catch((e: Error) => setError(`Couldn't get a hint. ${e.message}`))
  }

  // The position on the board: your right move played, else the position to solve.
  const shown = useMemo(() => {
    if (!played) return before
    const after = new Chess(fen)
    after.move({ from: played.slice(0, 2), to: played.slice(2, 4), promotion: played[4] })
    return after
  }, [played, before, fen])
  const playedSan = useMemo(() => {
    if (!played) return null
    try {
      return new Chess(fen).move({ from: played.slice(0, 2), to: played.slice(2, 4), promotion: played[4] }).san
    } catch {
      return null
    }
  }, [played, fen])
  const hintPiece = hintMove ? before.get(hintMove.slice(0, 2) as never) : null

  return {
    before,
    shown,
    selected,
    setSelected,
    checking,
    misses,
    hints,
    hintReady,
    hintPiece: hintPiece && hintMove ? { square: hintMove.slice(0, 2), type: hintPiece.type } : null,
    first,
    outcome,
    played,
    playedSan,
    error,
    submit,
    tryMove,
    askHint,
    showMe: () => submit(SKIP),
    /** Board props for the current state. */
    board: {
      lastMove: played ? { from: played.slice(0, 2), to: played.slice(2, 4) } : undefined,
      hint: hints >= 2 && !outcome ? hintMove : outcome === 'shown' ? (first?.best_uci ?? null) : null,
      glow: hints === 1 && !outcome && hintMove ? hintMove.slice(0, 2) : null,
      flash: played
        ? { square: played.slice(2, 4), tone: 'right' as const }
        : wrongSquare && !outcome
          ? { square: wrongSquare, tone: 'wrong' as const }
          : undefined,
      interactive: !outcome && !checking,
    },
  }
}

export type FindMove = ReturnType<typeof useFindMove>
