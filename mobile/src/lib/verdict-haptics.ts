export type VerdictCue = { id: number; tone: "right" | "wrong" };

/** Call at the verdict boundary, before rendering. Saved copies never replay it. */
export function createVerdictHaptics(emit: (tone: VerdictCue["tone"]) => void) {
  let seen: number | undefined;
  return (cue: VerdictCue) => {
    if (cue.id === seen) return;
    seen = cue.id;
    emit(cue.tone);
  };
}
