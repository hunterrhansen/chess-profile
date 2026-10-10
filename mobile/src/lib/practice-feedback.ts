import type { DeckCard, FeedbackQuality } from './api';
/** A prepared verdict is immediate feedback, never proof that the answer was saved. */
export function preparedQuality(card: Pick<DeckCard, 'fen_before' | 'feedback'>, uci: string): FeedbackQuality | undefined {
  const value = card.feedback;
  if (!value || value.version !== 1 || value.fen !== card.fen_before || uci === '0000') return;
  const quality = value.grades?.[uci];
  if (quality === 'best' || quality === 'excellent' || quality === 'good' || quality === 'wrong') return quality;
}

/** Stable across prepared and authoritative verdicts; a corrected verdict is new. */
export function practiceFlash(attempt: number, uci: string, correct: boolean) {
  return { square: uci.slice(2, 4), tone: correct ? "right" as const : "wrong" as const,
    id: attempt * 2 + (correct ? 1 : 0) };
}
