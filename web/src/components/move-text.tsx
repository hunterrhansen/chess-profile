import { ChessBishop, ChessKing, ChessKnight, ChessQueen, ChessRook } from 'lucide-react'
import { splitPiece } from '@/lib/format'

const PIECES = { K: ChessKing, Q: ChessQueen, R: ChessRook, B: ChessBishop, N: ChessKnight }

/**
 * A move in figurine notation, "♜d2": an outlined piece for White, a filled one for Black,
 * drawn in the text color so it reads in light and dark mode. Odd plies are White's moves.
 */
export function MoveText({
  ply,
  san,
  number,
  side,
}: {
  ply: number
  san: string
  number?: boolean
  /** Overrides the side worked out from `ply`. */
  side?: 'white' | 'black'
}) {
  const [piece, rest] = splitPiece(san)
  const Icon = piece ? PIECES[piece as keyof typeof PIECES] : null
  const white = side ? side === 'white' : ply % 2 === 1
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

/** Explanation text with moves tagged "[[w:Rxc4]]" / "[[b:Rb3]]" (lines.py) as piece icons. */
export function MarkedText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[\[[wb]:[^\]]+\]\])/).map((part, i) => {
        const m = part.match(/^\[\[([wb]):([^\]]+)\]\]$/)
        return m ? (
          <span key={i} className="font-medium">
            <MoveText ply={0} san={m[2]} side={m[1] === 'w' ? 'white' : 'black'} />
          </span>
        ) : (
          part
        )
      })}
    </>
  )
}
