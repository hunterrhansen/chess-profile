import type { Api } from "./api";
import type { GameDetail } from "./game-replay";
import {
  completionConfirmed,
  type ReviewSession,
  type ReviewMark,
} from "./review-session.ts";
const saves = new WeakMap<ReviewSession, Promise<void>>();
type FinishOptions = {
  api: Api;
  session: ReviewSession;
  gameId: number;
  marks: ReviewMark[];
  baselineReviewedAt: string | null;
  signal?: AbortSignal;
};
function current(signal?: AbortSignal) {
  if (signal?.aborted)
    throw Error(
      "Review save was interrupted. Reopen the review to check its status.",
    );
}
export function finishReview(options: FinishOptions): Promise<void> {
  const running = saves.get(options.session);
  if (running) return running;
  const result = save(options);
  saves.set(options.session, result);
  void result.finally(() => saves.delete(options.session)).catch(() => {});
  return result;
}
async function save({
  api,
  session,
  gameId,
  marks,
  baselineReviewedAt,
  signal,
}: FinishOptions) {
  current(signal);
  if (
    session.state.pendingFinish &&
    JSON.stringify(session.state.pendingFinish.marks) !== JSON.stringify(marks)
  )
    throw Error(
      "A previous review save is unresolved. Reopen this review before changing its marks.",
    );
  session.state.pendingFinish ??= { marks, baselineReviewedAt };
  // A storage failure leaves the exact pending set in memory; callers can retry without losing it.
  await session.save();
  current(signal);
  try {
    const r = await api<{ reviewed_at: string }>(
      `/api/games/${gameId}/review`,
      { marks },
      signal,
    );
    current(signal);
    if (!r.reviewed_at) throw Error("The review save could not be confirmed.");
  } catch (e) {
    current(signal);
    const game = await api<GameDetail>(
      `/api/games/${gameId}`,
      undefined,
      signal,
    ).catch(() => null);
    current(signal);
    if (!game || !completionConfirmed(game, session.state.pendingFinish))
      throw e;
  }
  current(signal);
  await session.clear().catch(() => {}); // Server success is authoritative even if cleanup storage is unavailable.
  session.state.pendingFinish = undefined;
}
export function reviewResults(game: GameDetail) {
  if (!game.reviewed_at) return null;
  const asked = game.review_marks.filter(
    (m) => !["praise", "seen"].includes(m.mark),
  );
  return {
    found: asked.filter((m) => m.mark === "found" || m.mark === "good").length,
    asked: asked.length,
    helped: asked.filter((m) => m.mark === "helped").length,
    missed: asked.filter((m) => m.mark === "missed").length,
    toFix: game.plies.filter(
      (m) =>
        m.color === game.color &&
        ["mistake", "blunder", "miss"].includes(m.classification ?? ""),
    ).length,
  };
}
