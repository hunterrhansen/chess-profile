import { Chess } from "chess.js";
import {
  replayGame,
  type Classification,
  type ReviewMove,
  type GameDetail,
  type StepMark,
} from "./game-replay.ts";
const isSound = (kind: Classification | null) =>
  kind == null ||
  ["brilliant", "great", "best", "excellent", "good"].includes(kind);
type Side = "white" | "black";

const BLUNDER_DROP = 20; // keep in step with analyze.THRESHOLDS

/** A turning point worth stopping on: a short label for the list, and one line saying what
 * happened, written for the player ("10…Qb4+ should have cost you the game"). */
export interface KeyMoment {
  ply: number;
  kind: Classification;
  short: string;
  headline: string;
}

/** "29…Qxc8" for Black, "10. Bxd4" for White. */
function moveLabel(ply: number, san: string, labels: Map<number, string>) {
  return labels.get(ply) ?? san;
}

const pct = (v: number | null) => Math.round(v ?? 50);

/**
 * The moments a review stops on, in game order: your brilliant and great moves, your
 * mistakes, misses and blunders, and every blunder of theirs with how you answered it
 * (punished, or let slide). Each comes with a headline built from the engine's numbers.
 */
export function keyMoments(
  moves: ReviewMove[],
  me: Side,
  opponent: string,
  labels: Map<number, string>,
): KeyMoment[] {
  const out: KeyMoment[] = [];
  const handled = new Set<number>(); // your replies already described as answers to their blunder

  moves.forEach((m, i) => {
    const reply = moves[i + 1];
    if (
      m.color === me ||
      !reply ||
      pct(m.win_pct_before) - pct(m.win_pct_after) < BLUNDER_DROP
    )
      return;
    handled.add(reply.ply);
    const theirs = moveLabel(m.ply, m.san, labels);
    const yours = moveLabel(reply.ply, reply.san, labels);
    if (isSound(reply.classification)) {
      const c = reply.classification;
      out.push({
        ply: reply.ply,
        kind: c === "brilliant" || c === "great" ? c : "best",
        short: "Punished their blunder",
        headline: `${yours} punished ${theirs}: your chance went from ${pct(reply.win_pct_before)}% to ${pct(reply.win_pct_after)}%.`,
      });
    } else {
      const c = reply.classification;
      out.push({
        ply: reply.ply,
        kind: c === "mistake" || c === "blunder" || c === "miss" ? c : "miss",
        short: "Missed their blunder",
        headline: `${yours} let ${opponent}'s ${theirs} slide.${reply.best_san ? ` ${reply.best_san} was the move.` : ""}`,
      });
    }
  });

  moves.forEach((m, i) => {
    const c = m.classification;
    if (m.color !== me || handled.has(m.ply) || !c) return;
    const label = moveLabel(m.ply, m.san, labels);
    const best = m.best_san ? ` ${m.best_san} was the move.` : "";
    if (c === "brilliant") {
      out.push({
        ply: m.ply,
        kind: c,
        short: "Brilliant",
        headline: `${label} was brilliant: a sacrifice the engine agrees with.`,
      });
    } else if (c === "great") {
      out.push({
        ply: m.ply,
        kind: c,
        short: "Great: the only move",
        headline: `${label} was the only move that held. Anything else lost a lot.`,
      });
    } else if (c === "miss") {
      out.push({
        ply: m.ply,
        kind: c,
        short: "Missed their mistake",
        headline: `${label} let ${opponent}'s mistake slide.${best}`,
      });
    } else if (c === "mistake" || c === "blunder") {
      // Did they hand it straight back? Then the lesson is the move, not the result.
      const reply = moves[i + 1];
      const givenBack =
        reply &&
        pct(reply.win_pct_before) - pct(reply.win_pct_after) >= BLUNDER_DROP;
      out.push({
        ply: m.ply,
        kind: c,
        short: givenBack
          ? `${c === "blunder" ? "Blunder" : "Mistake"}, and they missed it`
          : c === "blunder"
            ? "Blunder"
            : "Mistake",
        headline: givenBack
          ? `${label} should have cost you${c === "blunder" ? " the game" : ""}. ${opponent} missed it.`
          : `${label} dropped your chance from ${pct(m.win_pct_before)}% to ${pct(m.win_pct_after)}%.${best}`,
      });
    }
  });

  return out.sort((a, b) => a.ply - b.ply);
}

export type LessonStep = KeyMoment & {
  type: "find" | "look" | "praise";
  label: string;
  fenBefore: string;
  fenAfter: string;
};
export function buildReviewLesson(
  game: GameDetail,
):
  | { status: "ready"; steps: LessonStep[]; fingerprint: string }
  | { status: "replay-only"; reason: string } {
  const blocked = (reason: string) => ({
    status: "replay-only" as const,
    reason,
  });
  if (!game.analysed)
    return blocked("This game is awaiting analysis. You can replay its moves.");
  if (!game.color)
    return blocked("Your side is unknown. You can replay this game.");
  try {
    const r = replayGame(game);
    if (
      r.error ||
      r.moves.length !== game.plies.length ||
      !Array.isArray(game.deck_plies)
    )
      return blocked(
        "The analysis does not match the recorded moves. You can replay this game.",
      );
    for (let i = 0; i < r.moves.length; i++) {
      const m = game.plies[i],
        actual = r.moves[i];
      const chess = new Chess(r.positions[i].fen);
      const played = chess.move(m.san);
      if (
        m.ply !== i + 1 ||
        m.san !== actual.san ||
        m.color !== actual.color ||
        m.uci !== played.from + played.to + (played.promotion ?? "")
      )
        return blocked("The analysis does not match the recorded moves.");
    }
    const labels = new Map(r.moves.map((m) => [m.ply, m.label]));
    const opponent = game.color === "white" ? game.black : game.white;
    const moments = keyMoments(game.plies, game.color, opponent, labels);
    if (moments.length > 200)
      return blocked(
        "This game has too many key moments for a saved lesson. Replay is available.",
      );
    const deck = new Set(game.deck_plies);
    const steps = moments.map((m) => ({
      ...m,
      type: isSound(m.kind)
        ? ("praise" as const)
        : deck.has(m.ply)
          ? ("find" as const)
          : ("look" as const),
      label: labels.get(m.ply)!,
      fenBefore: r.positions[m.ply - 1].fen,
      fenAfter: r.positions[m.ply].fen,
    }));
    for (const step of steps)
      if (step.type === "find" && !game.plies[step.ply - 1].best_uci)
        return blocked(
          "A lesson answer is missing from this analysis. Replay is available.",
        );
    return {
      status: "ready",
      steps,
      fingerprint: JSON.stringify([
        game.color,
        game.start_fen,
        game.san,
        game.plies,
        game.deck_plies,
      ]),
    };
  } catch {
    return blocked(
      "This game or its analysis could not be read. Replay is available.",
    );
  }
}
export function assembleReviewMarks(
  steps: LessonStep[],
  marks: Record<number, StepMark>,
) {
  return steps.map((step) => {
    const mark = marks[step.ply];
    if (
      !mark ||
      (step.type === "find" &&
        !["found", "good", "helped", "missed"].includes(mark)) ||
      (step.type === "praise" && mark !== "praise") ||
      (step.type === "look" && mark !== "seen")
    )
      throw new Error("Finish each key moment before saving the review.");
    return { ply: step.ply, mark };
  });
}
