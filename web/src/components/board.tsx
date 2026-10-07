import { Chess, type Square } from 'chess.js'
import { useMemo } from 'react'
import { type Arrow, Chessboard } from 'react-chessboard'
import { MoveBadge } from '@/components/move-badge'
import { BOARD_PIECES } from '@/components/pieces'
import type { Classification } from '@/lib/api'
import { useMoveMs } from '@/lib/motion'
import { BOARDS } from '@/lib/preferences'
import { useMoveSound } from '@/lib/sound'
import { token } from '@/lib/tokens'
import { cn } from '@/lib/utils'

export type Side = 'white' | 'black'
export type Palette = (typeof BOARDS)[keyof typeof BOARDS]

/** Arrow colors: `best` the engine's better move (green), `line` the next move of an engine
 * line (blue), `danger` the reply that punishes a move (red). */
export type ArrowTone = 'best' | 'line' | 'danger'
export interface BoardArrow {
  from: string
  to: string
  tone: ArrowTone
}
const ARROW_TOKEN = { best: '--arrow-best', line: '--arrow-line', danger: '--arrow-danger' } as const

const FILES = 'abcdefgh'
const isLightSquare = (square: string) => (square.charCodeAt(0) - 97 + Number(square[1])) % 2 === 0

/**
 * Where a check comes from, so the board can show the attack: the king's square, and the
 * squares from each checking piece up to it (for a knight, just the knight's own square).
 */
export function checkSquares(fen: string): { king: string; path: string[] } | null {
  let chess: Chess
  try {
    chess = new Chess(fen)
  } catch {
    return null
  }
  if (!chess.inCheck()) return null
  const turn = chess.turn()
  const king = chess.findPiece({ type: 'k', color: turn })[0]
  if (!king) return null
  const path: string[] = []
  for (const from of chess.attackers(king, turn === 'w' ? 'b' : 'w')) {
    const df = FILES.indexOf(king[0]) - FILES.indexOf(from[0])
    const dr = Number(king[1]) - Number(from[1])
    if (df === 0 || dr === 0 || Math.abs(df) === Math.abs(dr)) {
      const steps = Math.max(Math.abs(df), Math.abs(dr))
      for (let s = 0; s < steps; s++) path.push(FILES[FILES.indexOf(from[0]) + Math.sign(df) * s] + (Number(from[1]) + Math.sign(dr) * s))
    } else {
      path.push(from) // a knight: no path, just the piece giving check
    }
  }
  return { king, path }
}

/**
 * The board, everywhere: Knightly's pieces on a rounded board sitting on its ledge, with the
 * states from the design canvas. Last move in yellow (blue in an engine line), the picked-up
 * piece ringed in sky with its legal moves as dots and rings, arrows, a classification badge,
 * and check shown as the attack: the king's square red and the checker's path tinted.
 *
 * Pass `onMove` to make it playable (click or drag); without it the board is for looking.
 */
export function Board({
  fen,
  orientation,
  palette,
  lastMove,
  inLine,
  selected,
  targets,
  arrows = [],
  badge,
  flash,
  movable,
  onMove,
  onSelect,
  className,
}: {
  fen: string
  orientation: Side
  palette: Palette
  lastMove?: { from: string; to: string }
  /** Showing an engine line rather than the game: highlights and frame turn blue. */
  inLine?: boolean
  selected?: string | null
  /** Legal destinations of the selected piece: a dot on an empty square, a ring on a capture. */
  targets?: ReadonlySet<string>
  arrows?: BoardArrow[]
  badge?: { square: string; kind: Classification } | null
  /** Lights a square up once after the piece lands: green for a right answer, red for wrong. */
  flash?: { square: string; tone: 'right' | 'wrong' }
  /** Which side's pieces can be picked up ('w' or 'b'); omit to allow none. */
  movable?: 'w' | 'b'
  onMove?: (from: string, to: string) => boolean
  onSelect?: (square: string | null) => void
  className?: string
}) {
  const moveMs = useMoveMs()
  useMoveSound(fen)
  const check = useMemo(() => checkSquares(fen), [fen])
  const occupied = useMemo(() => {
    try {
      return new Chess(fen)
    } catch {
      return null
    }
  }, [fen])

  const highlight = (sq: string) =>
    isLightSquare(sq) ? (inLine ? 'var(--line-highlight-light)' : palette.lightHl) : inLine ? 'var(--line-highlight-dark)' : palette.darkHl
  const styles: Record<string, React.CSSProperties> = {}
  for (const sq of [lastMove?.from, lastMove?.to, selected]) if (sq) styles[sq] = { backgroundColor: highlight(sq) }
  if (selected) styles[selected] = { ...styles[selected], boxShadow: 'inset 0 0 0 0.7cqw var(--selected)' }

  const libArrows: Arrow[] = arrows.map((a) => ({ startSquare: a.from, endSquare: a.to, color: token(ARROW_TOKEN[a.tone]) }))
  const playable = !!onMove && !!movable

  const click = (square: string) => {
    if (!playable) return
    if (selected && targets?.has(square)) {
      onMove(selected, square)
      return
    }
    const piece = occupied?.get(square as Square)
    onSelect?.(piece && piece.color === movable && square !== selected ? square : null)
  }

  const notation = { fontSize: 'clamp(8px, 2.1cqw, 12px)', fontWeight: 800 }

  return (
    <div
      className={cn(
        'min-w-0 flex-1 @container rounded-[10px] shadow-[0_4px_0_var(--lip)]',
        inLine && 'outline-3 outline-offset-2 outline-sky',
        className,
      )}
    >
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          pieces: BOARD_PIECES,
          boardStyle: { borderRadius: 10 },
          allowDragging: playable,
          canDragPiece: ({ piece }) => playable && piece.pieceType[0] === movable,
          onPieceDrag: ({ square }) => onSelect?.(square),
          onPieceDrop: ({ sourceSquare, targetSquare }) => !!targetSquare && !!onMove?.(sourceSquare, targetSquare),
          onSquareClick: ({ square }) => click(square),
          animationDurationInMs: moveMs,
          lightSquareStyle: { backgroundColor: palette.light },
          darkSquareStyle: { backgroundColor: palette.dark },
          lightSquareNotationStyle: { color: palette.dark },
          darkSquareNotationStyle: { color: palette.light },
          alphaNotationStyle: notation,
          numericNotationStyle: notation,
          arrows: libArrows,
          // A custom renderer replaces the library's own square wrapper, which is where it
          // applies `squareStyles`, so the highlights are applied here instead.
          squareRenderer: ({ square, children }) => (
            <div className="relative size-full" style={styles[square]}>
              {check?.path.includes(square) && <span className="pointer-events-none absolute inset-0 bg-check-path" />}
              {check?.king === square && <span className="pointer-events-none absolute inset-0 bg-check" />}
              <div className="relative size-full">{children}</div>
              {targets?.has(square) &&
                (occupied?.get(square as Square) ? (
                  <span className="pointer-events-none absolute inset-[4%] rounded-full shadow-[inset_0_0_0_0.9cqw_var(--move-hint)]" />
                ) : (
                  <span className="pointer-events-none absolute inset-[35%] rounded-full bg-move-hint" />
                ))}
              {flash?.square === square && (
                <span
                  className={cn(
                    'pointer-events-none absolute inset-0 animate-flash [animation-delay:var(--duration-move)]',
                    flash.tone === 'right' ? 'bg-brand/70' : 'bg-danger/70',
                  )}
                />
              )}
              {badge?.square === square && (
                <MoveBadge
                  key={fen}
                  kind={badge.kind}
                  pop
                  className="pointer-events-none absolute -top-2 -right-2 z-10 size-[38%] max-h-7 max-w-7 text-[clamp(11px,1.8vw,14px)] shadow-[inset_0_-2px_0_var(--move-shade),0_0_0_2px_var(--surface)] [&_svg]:size-[75%]"
                />
              )}
            </div>
          ),
        }}
      />
    </div>
  )
}
