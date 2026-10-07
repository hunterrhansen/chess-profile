/** The tactics your mistakes are tagged with (patterns.py; Lichess puzzle theme names). */
export type Pattern =
  | 'hangingPiece'
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'discoveredAttack'
  | 'backRankMate'
  | 'mate'
  | 'other'

export const PATTERNS: Record<Pattern, { label: string; one: string; tip: string }> = {
  hangingPiece: {
    label: 'Loose pieces',
    one: 'A loose piece',
    tip: 'Before each move, check which of your pieces are undefended, and what theirs are.',
  },
  fork: { label: 'Forks', one: 'A fork', tip: 'Look for squares where one of their pieces could hit two of yours.' },
  pin: { label: 'Pins', one: 'A pin', tip: 'Watch pieces lined up in front of your king or queen.' },
  skewer: { label: 'Skewers', one: 'A skewer', tip: "Keep your king and queen off open lines with their rooks and bishops." },
  discoveredAttack: {
    label: 'Discovered attacks',
    one: 'A discovered attack',
    tip: 'Watch what opens up when one of their pieces steps out of the way.',
  },
  backRankMate: { label: 'Back rank', one: 'A back-rank mate', tip: 'Give your king a square to breathe: a pawn move in front of it.' },
  mate: { label: 'Mates', one: 'A mating attack', tip: 'When their pieces gather near your king, look for checks first.' },
  other: { label: 'No clear tactic', one: 'No clear tactic', tip: '' },
}

export const patternOf = (p: string | null | undefined) => (p && p in PATTERNS ? PATTERNS[p as Pattern] : null)
