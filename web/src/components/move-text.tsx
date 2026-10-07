import { type PieceKind, PieceGlyph } from '@/components/pieces'
import { splitPiece } from '@/lib/format'

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
  const white = side ? side === 'white' : ply % 2 === 1
  return (
    <span className="whitespace-nowrap">
      {number && <span className="mr-1">{Math.ceil(ply / 2)}.</span>}
      {piece && <PieceGlyph kind={piece.toLowerCase() as PieceKind} side={white ? 'w' : 'b'} className="mr-px" />}
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
