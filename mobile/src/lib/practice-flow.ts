import { Chess, type Square } from "chess.js";
import type { DeckCard, DeckToday } from "./api";
import { tacticHint } from "./patterns.ts";
export type Promotion = "q" | "r" | "b" | "n";
export function promotionChoices(
  fen: string,
  from: Square,
  to: Square,
): Promotion[] {
  const moves = new Chess(fen).moves({ square: from, verbose: true });
  return (["q", "r", "b", "n"] as const).filter((kind) =>
    moves.some((move) => move.to === to && move.promotion === kind),
  );
}
export function practiceHint(
  card: Pick<DeckCard, "pattern" | "classification">,
  count: number,
  bestMove?: string,
) {
  const tactic = tacticHint(
    card.pattern,
    card.classification === "miss" ? "chance" : "threat",
  );
  const rungs = tactic ? ["tactic", "piece", "move"] : ["piece", "move"];
  const rung = count > 0 ? rungs[Math.min(count, rungs.length) - 1] : undefined;
  const next = rungs[count];
  return {
    rung,
    showPiece: rung === "piece",
    showMove: rung === "move",
    text:
      rung === "tactic"
        ? tactic!
        : rung === "piece" && bestMove
          ? `Look at the piece on ${bestMove.slice(0, 2)}.`
          : rung === "move"
            ? "The arrow shows the move. Play it."
            : undefined,
    next,
    label:
      count === 0
        ? "Hint"
        : next === "piece"
          ? "Show piece"
          : next === "move"
            ? "Show move"
            : "Hint shown",
  };
}
export function practiceSummary(results: { mark: string }[]) {
  return {
    found: results.filter((r) => r.mark === "found" || r.mark === "good")
      .length,
    helped: results.filter((r) => r.mark === "helped").length,
    missed: results.filter((r) => r.mark === "missed").length,
  };
}
type Hint = { count: number; bestMove?: string; startedAt: number };
type Snapshot = {
  day: string;
  queue: DeckCard[];
  hints: Record<string, Hint>;
  pending: DeckCard[];
};
type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
};
const id = (card: Pick<DeckCard, "game_id" | "ply">) =>
  `${card.game_id}-${card.ply}`;
function validCard(value: unknown): value is DeckCard {
  if (!value || typeof value !== "object") return false;
  const c = value as DeckCard;
  if (
    !Number.isInteger(c.game_id) ||
    !Number.isInteger(c.ply) ||
    typeof c.fen_before !== "string" ||
    !["white", "black"].includes(c.color) ||
    typeof c.san !== "string" ||
    typeof c.classification !== "string"
  )
    return false;
  try {
    new Chess(c.fen_before);
    return true;
  } catch {
    return false;
  }
}
/** Local learning state only. The server remains the source of grades and scheduling. */
const pendingWrites = new Map<string, Promise<unknown>>();
const snapshots = new Map<string, Snapshot>();
const loadedSnapshots = new WeakSet<Snapshot>();
const acknowledgements = new WeakMap<Snapshot, Map<string, number>>();
const revisions = new WeakMap<Snapshot, number>();
export class PracticeSession {
  private storage: Storage;
  private key: string;
  private day: string;
  private state: Snapshot;
  constructor(storage: Storage, scope: string, day: string) {
    this.storage = storage;
    this.key = `knightly.practice.v1.${scope}`;
    this.day = day;
    const shared = snapshots.get(this.key);
    this.state =
      shared?.day === day ? shared : { day, queue: [], hints: {}, pending: [] };
    snapshots.set(this.key, this.state);
  }
  isCurrentDay() {
    return this.day === new Date().toISOString().slice(0, 10);
  }
  get queue() {
    return this.state.queue;
  }
  checkpoint() {
    return revisions.get(this.state) ?? 0;
  }
  hint(card: Pick<DeckCard, "game_id" | "ply">) {
    return this.state.hints[id(card)];
  }
  async load() {
    try {
      await pendingWrites.get(this.key)?.catch(() => {});
      if (loadedSnapshots.has(this.state)) return;
      const raw = await this.storage.getItem(this.key);
      if (loadedSnapshots.has(this.state)) return;
      loadedSnapshots.add(this.state);
      const value = raw ? JSON.parse(raw) : null;
      if (value?.day !== this.day || !Array.isArray(value.queue)) return;
      this.state.queue = value.queue.filter(validCard).slice(0, 100);
      this.state.pending = Array.isArray(value.pending)
        ? value.pending.filter(validCard).slice(0, 100)
        : [];
      for (const [key, hint] of Object.entries(value.hints ?? {})) {
        const h = hint as Hint;
        if (
          h &&
          Number.isInteger(h.count) &&
          h.count >= 0 &&
          h.count <= 3 &&
          Number.isFinite(h.startedAt) &&
          (!h.bestMove || /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(h.bestMove))
        )
          this.state.hints[key] = h;
      }
    } catch {
      /* Storage unavailable/corrupt: this session can still work in memory. */
    }
  }
  private save() {
    if (snapshots.get(this.key) !== this.state) return Promise.resolve();
    loadedSnapshots.add(this.state);
    const json = JSON.stringify(this.state);
    const write = (pendingWrites.get(this.key) ?? Promise.resolve())
      .catch(() => {})
      .then(() => this.storage.setItem(this.key, json));
    pendingWrites.set(this.key, write);
    void write
      .finally(() => {
        if (pendingWrites.get(this.key) === write)
          pendingWrites.delete(this.key);
      })
      .catch(() => {});
    return write;
  }
  enqueue(card: DeckCard) {
    if (!this.state.queue.some((c) => id(c) === id(card)))
      this.state.queue = [...this.state.queue, card];
    return this.save();
  }
  beginAnswer(card: DeckCard, startedAt: number) {
    if (!this.state.pending.some((c) => id(c) === id(card)))
      this.state.pending.push(card);
    this.state.hints[id(card)] ??= { count: 0, startedAt };
    return this.save();
  }
  finishAnswer(card: DeckCard, retry: boolean) {
    // A reopened screen may already have recovered and completed this answer.
    if (!this.state.pending.some((c) => id(c) === id(card)))
      return Promise.resolve();
    this.state.pending = this.state.pending.filter((c) => id(c) !== id(card));
    if (retry && !this.state.queue.some((c) => id(c) === id(card)))
      this.state.queue.push(card);
    const revision = this.checkpoint() + 1;
    revisions.set(this.state, revision);
    const acknowledged = acknowledgements.get(this.state) ?? new Map();
    acknowledged.set(id(card), revision);
    acknowledgements.set(this.state, acknowledged);
    return this.save();
  }
  complete(card: DeckCard) {
    this.state.queue = this.state.queue.filter((c) => id(c) !== id(card));
    delete this.state.hints[id(card)];
    return this.save();
  }
  rememberHint(
    card: DeckCard,
    count: number,
    bestMove: string | undefined,
    startedAt: number,
  ) {
    this.state.hints[id(card)] = { count, bestMove, startedAt };
    return this.save();
  }
  /** Never submit an old retry as a new graded card after the server day changes. */
  reconcile(deck: DeckToday, checkpoint = Number.POSITIVE_INFINITY) {
    const reviewed = new Set(deck.results.map(id));
    for (const card of this.state.pending) {
      const result = deck.results.find((r) => id(r) === id(card));
      if (
        result &&
        ["helped", "missed"].includes(result.mark) &&
        !this.state.queue.some((c) => id(c) === id(card))
      )
        this.state.queue.push(card);
    }
    // GET may race ahead of an in-flight POST. Keep unresolved cards until a
    // response or a later server result settles them.
    this.state.pending = this.state.pending.filter(
      (card) => !reviewed.has(id(card)),
    );
    this.state.queue = this.state.queue.filter(
      (card) =>
        reviewed.has(id(card)) ||
        (acknowledgements.get(this.state)?.get(id(card)) ?? 0) > checkpoint,
    );
    return this.save();
  }
}
