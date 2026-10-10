import type { Api } from "./api";
import type { ReviewMove, StepMark } from "./game-replay";
import type { LessonStep } from "./review-lesson";
export function nextReviewStep(
  steps: LessonStep[],
  index: number,
  marks: Record<number, StepMark>,
) {
  const step = steps[index];
  if (!step) throw Error("This key moment is no longer available.");
  if (step.type === "find" && !marks[step.ply])
    throw Error("Resolve this position before continuing.");
  const updated = { ...marks };
  if (step.type !== "find")
    updated[step.ply] = step.type === "praise" ? "praise" : "seen";
  return {
    index: Math.min(index + 1, steps.length - 1),
    marks: updated,
    last: index === steps.length - 1,
  };
}
export function reviewPrompt(step: LessonStep, move: ReviewMove) {
  return step.type === "find"
    ? step.short.startsWith("Missed")
      ? "Punish their mistake"
      : `You played ${move.san}. Find a better move.`
    : step.headline;
}
export async function loadExplanation(
  api: Api,
  gameId: number,
  ply: number,
  enabled: boolean,
  signal?: AbortSignal,
) {
  if (!enabled) return null;
  const lines = await api<{ best?: { summary?: string | null } }>(
    `/api/games/${gameId}/lines/${ply}`,
    undefined,
    signal,
  );
  return typeof lines.best?.summary === "string" ? lines.best.summary : null;
}

/** Cancellation belongs to a single hydration pass, including React effect restarts. */
export class ReviewLifecycle {
  private controller = new AbortController();
  get signal() {
    return this.controller.signal;
  }
  begin() {
    this.controller.abort();
    this.controller = new AbortController();
    return this.signal;
  }
  end(signal: AbortSignal) {
    if (signal === this.signal) this.controller.abort();
  }
}
