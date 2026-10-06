import { ChessBishop, ChessKing, ChessKnight, ChessQueen, ChessRook } from 'lucide-react'
import { splitPiece } from '@/lib/format'

const PIECES = { K: ChessKing, Q: ChessQueen, R: ChessRook, B: ChessBishop, N: ChessKnight }

/**
 * A move in figurine notation, "♜d2": an outlined piece for White, a filled one for Black,
 * drawn in the text color so it reads in light and dark mode. Odd plies are White's moves.
 */
export function MoveText({ ply, san, number }: { ply: number; san: string; number?: boolean }) {
  const [piece, rest] = splitPiece(san)
  const Icon = piece ? PIECES[piece as keyof typeof PIECES] : null
  const white = ply % 2 === 1
  return (
    <span className="inline-flex items-center whitespace-nowrap">
      {number && <span className="mr-1">{Math.ceil(ply / 2)}.</span>}
      {Icon && (
        <Icon
          aria-hidden
          className="mr-px size-[1.1em] shrink-0"
          strokeWidth={2}
          fill={white ? 'none' : 'currentColor'}
        />
      )}
      {piece && <span className="sr-only">{piece}</span>}
      {rest}
    </span>
  )
}
