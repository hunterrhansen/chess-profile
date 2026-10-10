/** The tactics your mistakes are tagged with (patterns.py; Lichess puzzle theme names). */
export type Pattern =
  | "hangingPiece"
  | "fork"
  | "pin"
  | "skewer"
  | "discoveredAttack"
  | "backRankMate"
  | "mate"
  | "other";

export const PATTERNS: Record<
  Pattern,
  { label: string; one: string; tip: string }
> = {
  hangingPiece: {
    label: "Loose pieces",
    one: "A loose piece",
    tip: "Before each move, check which of your pieces are undefended, and what theirs are.",
  },
  fork: {
    label: "Forks",
    one: "A fork",
    tip: "Look for squares where one of their pieces could hit two of yours.",
  },
  pin: {
    label: "Pins",
    one: "A pin",
    tip: "Watch pieces lined up in front of your king or queen.",
  },
  skewer: {
    label: "Skewers",
    one: "A skewer",
    tip: "Keep your king and queen off open lines with their rooks and bishops.",
  },
  discoveredAttack: {
    label: "Discovered attacks",
    one: "A discovered attack",
    tip: "Watch what opens up when one of their pieces steps out of the way.",
  },
  backRankMate: {
    label: "Back rank",
    one: "A back-rank mate",
    tip: "Give your king a square to breathe: a pawn move in front of it.",
  },
  mate: {
    label: "Mates",
    one: "A mating attack",
    tip: "When their pieces gather near your king, look for checks first.",
  },
  other: { label: "No clear tactic", one: "No clear tactic", tip: "" },
};

export const patternOf = (p: string | null | undefined) =>
  p && p in PATTERNS ? PATTERNS[p as Pattern] : null;

/**
 * The first rung of Hint: the idea in words, before anything on the board. A blunder or
 * mistake is tagged with what their reply does to you (a threat to see coming); a miss, and a
 * puzzle's theme, with what your move does to them (a chance to take). patterns.py.
 */
const HINT: Partial<Record<Pattern, { threat: string; chance: string }>> = {
  hangingPiece: {
    threat: "Something of yours is loose. Which piece is undefended?",
    chance: "One of their pieces is loose. Can you win it?",
  },
  fork: {
    threat: "Watch out for a fork: one of theirs could hit two of yours.",
    chance: "Look for a fork: one move that hits two pieces.",
  },
  pin: {
    threat: "Watch for a pin against your king or queen.",
    chance:
      "Look for a pin: a piece that can’t move without exposing a bigger one.",
  },
  skewer: {
    threat: "Your king or queen is on an open line. Who could line up on it?",
    chance: "Look for a skewer: attack the big piece, win the one behind it.",
  },
  discoveredAttack: {
    threat: "Watch what opens up when one of their pieces moves.",
    chance: "Look for a discovered attack: move one piece to unleash another.",
  },
  backRankMate: {
    threat: "Your back rank is weak. Does your king have a square?",
    chance: "Their back rank is weak. Look at checks on it.",
  },
  mate: {
    threat: "Your king is in danger. Look at their checks first.",
    chance: "There’s a mating attack. Look at checks first.",
  },
};

/** The tactic hint for a position, or null when it has no clear tactic (then Hint starts at
 * the piece). `voice`: 'threat' for your mistakes and blunders, 'chance' for misses and puzzles. */
export function tacticHint(
  pattern: string | null | undefined,
  voice: "threat" | "chance",
) {
  return pattern && pattern in HINT ? HINT[pattern as Pattern]![voice] : null;
}
