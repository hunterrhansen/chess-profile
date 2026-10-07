import { type CSSProperties, type ReactNode, useId } from 'react'
import type { PieceRenderObject } from 'react-chessboard'
import { cn } from '@/lib/utils'

export type PieceKind = 'k' | 'q' | 'r' | 'b' | 'n' | 'p'
export type PieceSide = 'w' | 'b'

const NAMES: Record<PieceKind, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' }

/** Each piece's body on a 100×100 grid, standing on the shared base (y 79–92). */
const BODY: Record<PieceKind, ReactNode> = {
  p: (
    <>
      <path d="M34 79 C34 64 40 56 50 51 C60 56 66 64 66 79 Z" />
      <rect x="37" y="44" width="26" height="9" rx="4.5" />
      <circle cx="50" cy="30" r="13" />
    </>
  ),
  r: (
    <>
      <path d="M31 79 L34 44 H66 L69 79 Z" />
      <path d="M27 18 H37 V25 H45 V18 H55 V25 H63 V18 H73 V40 Q73 44 69 44 H31 Q27 44 27 40 Z" />
    </>
  ),
  n: (
    <path d="M30 79 H72 C72 60 70 46 64 36 C59 27 52 21 44 19 L45 10 L37 16 C29 19 22 28 18 39 L15 50 C17 57 26 58 30 53 L39 46 C41 54 36 64 30 79 Z" />
  ),
  b: (
    <>
      <path d="M37 66 C37 72 33 76 29 79 H71 C67 76 63 72 63 66 Z" />
      <rect x="35" y="58" width="30" height="9" rx="4.5" />
      <path d="M50 19 C35 30 33 46 40 58 H60 C67 46 65 30 50 19 Z" />
      <circle cx="50" cy="13" r="6.5" />
    </>
  ),
  q: (
    <>
      <path d="M34 69 C34 74 29 77 26 79 H74 C71 77 66 74 66 69 Z" />
      <rect x="31" y="61" width="38" height="9" rx="4.5" />
      <path d="M22 30 L33 61 H67 L78 30 L63 46 L58 22 L50 44 L42 22 L37 46 Z" />
      <circle cx="22" cy="27" r="5.5" />
      <circle cx="42" cy="19" r="5.5" />
      <circle cx="58" cy="19" r="5.5" />
      <circle cx="78" cy="27" r="5.5" />
    </>
  ),
  k: (
    <>
      <path d="M35 69 C35 74 30 77 27 79 H73 C70 77 65 74 65 69 Z" />
      <rect x="32" y="61" width="36" height="9" rx="4.5" />
      <path d="M27 40 C27 30 37 26 50 32 C63 26 73 30 73 40 C73 50 66 55 64 61 H36 C34 55 27 50 27 40 Z" />
      <rect x="46" y="6" width="8" height="24" rx="3" />
      <rect x="39" y="12" width="22" height="8" rx="3" />
    </>
  ),
}

/** Lines drawn over the body: the rook's band, the knight's mane, the bishop's mitre cut. */
const DETAIL: Partial<Record<PieceKind, string>> = {
  r: 'M36 58 H64',
  n: 'M50 24 C58 30 63 42 64 56',
  b: 'M56 30 L46 44',
}

const COLORS = {
  w: { fill: 'var(--piece-white)', shade: 'var(--piece-white-shade)', detail: 'var(--piece-white-shade)', outline: 'var(--piece-outline)', eye: 'var(--piece-outline)' },
  b: { fill: 'var(--piece-black)', shade: 'var(--piece-black-shade)', detail: 'var(--piece-black-detail)', outline: 'var(--piece-black-outline)', eye: 'var(--piece-black-eye)' },
}

/**
 * Knightly's pieces: flat shapes with a dark outline, each standing on the same rounded base
 * (the brand's ledge). The colors are `--piece-*` tokens, the same in both themes.
 */
export function Piece({ kind, side, className, style }: { kind: PieceKind; side: PieceSide; className?: string; style?: CSSProperties }) {
  const c = COLORS[side]
  const stroke = { stroke: c.outline, strokeWidth: 4.5, strokeLinejoin: 'round', strokeLinecap: 'round' } as const
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${side === 'w' ? 'White' : 'Black'} ${NAMES[kind]}`}
      className={cn('block size-full overflow-visible', className)}
      style={style}
    >
      <rect x="20" y="79" width="60" height="13" rx="6.5" style={{ ...stroke, fill: c.shade }} />
      <g style={{ ...stroke, fill: c.fill }}>{BODY[kind]}</g>
      {kind === 'n' && <circle cx="35" cy="31" r="3.6" style={{ fill: c.eye }} />}
      {DETAIL[kind] && <path d={DETAIL[kind]} style={{ fill: 'none', stroke: c.detail, strokeWidth: 4, strokeLinecap: 'round' }} />}
    </svg>
  )
}

/** The set in react-chessboard's shape ("wK", "bN"…), for its `pieces` option. */
export const BOARD_PIECES: PieceRenderObject = Object.fromEntries(
  (['w', 'b'] as const).flatMap((side) =>
    (Object.keys(NAMES) as PieceKind[]).map((kind) => [
      `${side}${kind.toUpperCase()}`,
      (props?: { svgStyle?: CSSProperties }) => (
        // A little inset so neighbouring bases don't touch, as on the canvas.
        <div className="size-full p-[6%]">
          <Piece kind={kind} side={side} style={props?.svgStyle} />
        </div>
      ),
    ]),
  ),
)

/**
 * A piece drawn in the text color for figurine notation ("♜d2"): outlined for White, filled
 * for Black, no base. It sits on the text's baseline like a letter, in light and dark mode.
 * The bishop's mitre slit is cut out so it never reads as a pawn at text size.
 */
export function PieceGlyph({ kind, side, className }: { kind: PieceKind; side: PieceSide; className?: string }) {
  const id = useId()
  return (
    <svg viewBox="5 3 90 86" aria-hidden className={cn('inline-block size-[1.1em] align-[-0.2em]', className)}>
      {DETAIL[kind] && kind === 'b' && (
        <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect width="100" height="100" fill="white" />
          <path d={DETAIL[kind]} stroke="black" strokeWidth={7} strokeLinecap="round" />
        </mask>
      )}
      <g
        mask={kind === 'b' ? `url(#${id})` : undefined}
        style={{
          fill: side === 'w' ? 'none' : 'currentColor',
          stroke: 'currentColor',
          strokeWidth: 7,
          strokeLinejoin: 'round',
          strokeLinecap: 'round',
        }}
      >
        {BODY[kind]}
        <path d="M24 85.5 H76" />
      </g>
    </svg>
  )
}
