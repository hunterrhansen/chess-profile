import type { MoveSound } from "./board-motion";

/** A mating move already contains a victory chord; avoid two celebrations at once. */
export function answerSound(
  tone: "right" | "wrong" | undefined,
  move: MoveSound | undefined,
): "right" | "wrong" | null {
  if (!tone || (tone === "right" && move === "checkmate")) return null;
  return tone;
}
