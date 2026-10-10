import { Chess } from "chess.js";
import type { LessonStep } from "./review-lesson";
import type { DeckAnswer } from "./api";
import type { StepMark, GameDetail } from "./game-replay";
export type PositionProgress = {
  hints: number;
  hintMove?: string;
  pendingHint?: string;
  startedAt: number;
  hadAttempt: boolean;
  day?: string;
  first?: DeckAnswer;
  outcome?: StepMark;
  played?: string;
  pending?: { uci: string; day: string };
  needsRestart?: boolean;
};
export type ReviewMark = { ply: number; mark: StepMark };
export type PendingFinish = {
  marks: ReviewMark[];
  baselineReviewedAt: string | null;
};
export type ReviewSnapshot = {
  step: number;
  marks: Record<number, StepMark>;
  positions: Record<number, PositionProgress>;
  pendingFinish?: PendingFinish;
};
type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
  removeItem: (key: string) => Promise<unknown>;
};
const writes = new Map<string, Promise<unknown>>();
const marks = ["found", "good", "helped", "missed", "praise", "seen"];
const uci = (v: unknown) =>
  typeof v === "string" && /^(0000|[a-h][1-8][a-h][1-8][qrbn]?)$/.test(v);
const day = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const markList = (v: unknown): v is ReviewMark[] =>
  Array.isArray(v) &&
  v.length <= 200 &&
  v.every(
    (m) => Number.isInteger(m?.ply) && m.ply > 0 && marks.includes(m.mark),
  );
function fresh(): ReviewSnapshot {
  return { step: 0, marks: {}, positions: {} };
}
function valid(value: ReviewSnapshot) {
  if (
    !value ||
    !Number.isInteger(value.step) ||
    value.step < 0 ||
    value.step > 200 ||
    !value.marks ||
    !value.positions
  )
    return false;
  if (
    Object.keys(value.positions).length > 200 ||
    Object.keys(value.marks).length > 200
  )
    return false;
  if (
    !Object.entries(value.marks).every(
      ([k, v]) => /^\d+$/.test(k) && Number(k) > 0 && marks.includes(v),
    )
  )
    return false;
  return (
    Object.entries(value.positions).every(
      ([k, p]) =>
        /^\d+$/.test(k) &&
        Number(k) > 0 &&
        p &&
        Number.isInteger(p.hints) &&
        p.hints >= 0 &&
        p.hints <= 3 &&
        Number.isFinite(p.startedAt) &&
        typeof p.hadAttempt === "boolean" &&
        (!p.day || day(p.day)) &&
        (!p.hintMove || uci(p.hintMove)) &&
        (!p.pendingHint ||
          ["tactic", "piece", "move"].includes(p.pendingHint)) &&
        (!p.played || uci(p.played)) &&
        (!p.outcome || marks.includes(p.outcome)) &&
        (!p.first ||
          (typeof p.first.correct === "boolean" &&
            uci(p.first.best_uci) &&
            typeof p.first.best_san === "string")) &&
        (!p.pending || (uci(p.pending.uci) && day(p.pending.day))),
    ) &&
    (!value.pendingFinish ||
      (markList(value.pendingFinish.marks) &&
        (value.pendingFinish.baselineReviewedAt === null ||
          typeof value.pendingFinish.baselineReviewedAt === "string")))
  );
}
/** Learning state, never a source of grades. Writes are serialized across mounted instances. */
export class ReviewSession {
  state: ReviewSnapshot = fresh();
  private storage: Storage;
  private key: string;
  private fingerprint: string;
  constructor(
    storage: Storage,
    scope: string,
    gameId: number,
    fingerprint: string,
  ) {
    this.storage = storage;
    this.fingerprint = fingerprint;
    let hash = 2166136261;
    for (const c of fingerprint)
      hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    this.key = `knightly.review.v1.${scope}.${gameId}.${hash >>> 0}`;
  }
  async load() {
    await writes.get(this.key)?.catch(() => {});
    const raw = await this.storage.getItem(this.key);
    try {
      const v = raw ? JSON.parse(raw) : null;
      if (v?.fingerprint === this.fingerprint && valid(v.state))
        this.state = v.state;
    } catch {
      this.state = fresh();
    }
  }
  update(patch: Partial<ReviewSnapshot>) {
    Object.assign(this.state, patch);
  }
  save() {
    const raw = JSON.stringify({
      fingerprint: this.fingerprint,
      state: this.state,
    });
    return this.enqueue(() => this.storage.setItem(this.key, raw));
  }
  clear() {
    return this.enqueue(() => this.storage.removeItem(this.key));
  }
  private enqueue(work: () => Promise<unknown>) {
    const write = (writes.get(this.key) ?? Promise.resolve())
      .catch(() => {})
      .then(work);
    writes.set(this.key, write);
    void write
      .finally(() => {
        if (writes.get(this.key) === write) writes.delete(this.key);
      })
      .catch(() => {});
    return write;
  }
}
export function completionConfirmed(
  game: Pick<GameDetail, "review_marks" | "reviewed_at">,
  pending: PendingFinish,
) {
  return (
    !!game.reviewed_at &&
    game.reviewed_at !== pending.baselineReviewedAt &&
    JSON.stringify(game.review_marks) === JSON.stringify(pending.marks)
  );
}
export function recoverPosition(
  p: PositionProgress,
  serverDay: string,
): PositionProgress {
  if (p.outcome) return p;
  return {
    ...p,
    pending: undefined,
    hadAttempt: p.hadAttempt || !!p.pending,
    needsRestart: !!p.day && p.day !== serverDay,
    day: p.day ?? serverDay,
  };
}

/** Storage can be valid JSON yet contain a move that cannot be rendered for this lesson. */
export function restoreReviewSnapshot(
  state: ReviewSnapshot,
  steps: LessonStep[],
): ReviewSnapshot {
  const restored: ReviewSnapshot = {
    ...state,
    marks: { ...state.marks },
    positions: { ...state.positions },
  };
  const legal = (fen: string, move?: string) => {
    if (!move || move === "0000") return false;
    try {
      return !!new Chess(fen).move({
        from: move.slice(0, 2),
        to: move.slice(2, 4),
        promotion: move[4],
      });
    } catch {
      return false;
    }
  };
  for (const step of steps) {
    const p = restored.positions[step.ply];
    if (step.type !== "find") {
      if (
        restored.marks[step.ply] &&
        restored.marks[step.ply] !==
          (step.type === "praise" ? "praise" : "seen")
      )
        delete restored.marks[step.ply];
      continue;
    }
    const resolved = p?.outcome;
    const validResolution =
      resolved &&
      ["found", "good", "helped", "missed"].includes(resolved) &&
      restored.marks[step.ply] === resolved &&
      legal(step.fenBefore, p.played) &&
      !!p.first &&
      legal(step.fenBefore, p.first.best_uci);
    if (
      (resolved || restored.marks[step.ply] || p?.played) &&
      !validResolution
    ) {
      restored.positions[step.ply] = {
        hints: p?.hints ?? 0,
        startedAt: p?.startedAt ?? Date.now(),
        hadAttempt: true,
        day: p?.day,
      };
      delete restored.marks[step.ply];
      // Corrupt learning state cannot serve as evidence for an exact pending finish.
      restored.pendingFinish = undefined;
    } else if (p?.hintMove && !legal(step.fenBefore, p.hintMove)) {
      restored.positions[step.ply] = {
        ...p,
        hintMove: undefined,
        pendingHint: "piece",
      };
    }
  }
  const firstUnresolved = steps.findIndex((step) => !restored.marks[step.ply]);
  restored.step = Math.min(
    restored.step,
    Math.max(0, steps.length - 1),
    firstUnresolved < 0 ? restored.step : firstUnresolved,
  );
  return restored;
}
