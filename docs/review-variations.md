# Review variations

## First release

Answer “What if I played a different move here?” without a separate exploration mode.
Keep Knightly's Chess.com-style board and notation inside its Duolingo-style lesson and
All moves layouts. Reuse Board, ReviewBoard, MoveText, Button, Badge, NavButton, EvalBar,
the blue line state, and the existing theme tokens. No new visual language or page shell.

- In All moves, click or drag a legal move from any displayed position. A move matching
  the next recorded move continues the game; a different move starts a variation.
- In the review lesson, look/praise positions and displayed engine lines are playable.
  Find steps keep their existing graded attempt until the verdict. After the verdict,
  moves explore freely, without grading or changing the review deck.
  Before/after arrows beside the preview return to the position before the reviewed move
  so the player can immediately try an alternative there.
- Both sides can move in a variation. Navigation goes through that variation; moving
  after stepping backward keeps both continuations available for this mounted session.
- One Stockfish preview shows evaluation from White's perspective and a short principal
  variation. Selecting a move plays through to it; the engine never moves automatically.
- Variation positions use the existing blue frame/highlights and say “Variation · not
  played”. Original classifications, clocks, and graph remain facts about the game.
- Back to game restores the exact displayed position that exploration started from.
  Selecting an original move also returns to the game. Escape returns; arrows navigate.
- Loading/error states do not block moves. Old engine responses never replace a newer
  position's preview. Retry is explicit. Terminal positions show their result.
- Promotions default to a queen, matching Play and Practice; engine previews preserve
  underpromotions. A manual promotion picker is a later enhancement.

## Implementation

An in-memory move tree is separate from recorded replay and lesson progress. Each node
stores its legal move, FEN, parent, and children; selecting an existing child reuses it.
Reconstruct its chess.js history for repetition, and send the root FEN plus UCI path to
the server. Roots are scoped to the game and displayed position. No database migration.

POST `/api/review/position` accepts a bounded FEN and up to 256 legal UCI moves. Validate
the board and every move before Stockfish. Return `start_fen`, UCI/SAN preview, White's
centipawn/mate evaluation, White's win chance, and terminal status. Use one bounded search
(depth 18, 250k nodes, 1.5 seconds), one thread, and the shared per-user engine quota.

Debounce previews 250ms; abort obsolete requests and cache up to 128 position/history
results per mounted view. Keep terminal positions local and server-validated. Preserve
move history for repetition; do not treat equal FENs with different histories as equal
analysis requests.

## Acceptance

1. Original game moves and grading data remain unchanged after exploration.
2. Legal click/drag moves branch immediately, for either color and either orientation.
3. A preview click plays exactly the selected prefix, including castling and promotions.
4. Previous, Next, move breadcrumbs, retained alternatives, and Back to game agree with
   the displayed board. Back restores the origin, including an engine-line step.
5. Illegal moves and invalid FENs are rejected; mate/draw stop preview and play.
6. Rapid navigation, missing Stockfish, and quota failures leave the board usable.
7. Existing light/dark tokens, phone lesson sizing, and desktop move layout still fit.

## Later

Saved/exported variations, multiple engine lines, manual underpromotion picker, branching
tree editor, engine settings, autoplay, and a redesigned review summary/coach.
