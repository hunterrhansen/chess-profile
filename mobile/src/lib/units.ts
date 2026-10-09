import type { Unit } from "@/lib/home";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** How each unit talks about its number: the line under the title, the unit check's bar,
 * and the kind of game worth reviewing for it. */
const COPY: Record<
  Unit["id"],
  {
    value: (v: number) => string;
    target: string;
    check: (hits: number, size: number) => string;
    checkLabel: string;
    review: string;
  }
> = {
  blunders: {
    value: (v) => `${v.toFixed(1)} blunders a game`,
    target: "under 1.5",
    check: (h, n) => `${h} of ${n} games under 1.5`,
    checkLabel: "Unit check: under 1.5 blunders over 10 games",
    review: "Review a game with a blunder",
  },
  conversion: {
    value: (v) => `${pct(v)} of winning positions converted`,
    target: "80%",
    check: (h, n) => `${h} of ${n} winning positions won`,
    checkLabel: "Unit check: win 80% of your next 10 winning positions",
    review: "Review a game you were winning",
  },
  punish: {
    value: (v) => `${pct(v)} of their blunders punished`,
    target: "70%",
    check: (h, n) => `${h} of ${n} games with every blunder punished`,
    checkLabel: "Unit check: punish 70% of their blunders over 10 games",
    review: "Review a game where they blundered",
  },
  comebacks: {
    value: (v) => `${pct(v)} comebacks from losing positions`,
    target: "45%",
    check: (h, n) => `${h} of ${n} lost positions saved`,
    checkLabel: "Unit check: save 45% of your next 10 lost positions",
    review: "Review a game you were losing",
  },
};

export function unitCopy(u: Unit) {
  const c = COPY[u.id];
  const verb = u.lower_better ? "Get it" : "Get it to";
  return {
    /** "2.3 blunders a game. Get it under 1.5." */
    goal:
      u.value == null
        ? `Not enough games yet. Target: ${c.target}.`
        : `${c.value(u.value)}. ${verb} ${c.target}.`,
    /** "69% of winning positions converted. Target: 80%." */
    note:
      u.done && u.check.value != null
        ? `Done at ${c.value(u.check.value)}. It comes back if the number slips.`
        : u.value == null
          ? `Not enough games yet. Target: ${c.target}.`
          : `${c.value(u.value)}. Target: ${c.target}.`,
    /** "3 of 10 games under 1.5" */
    checkProgress: c.check(u.check.hits, u.check.size),
    checkLabel: c.checkLabel,
    review: c.review,
    /** "1.4 blunders a game over your last 10" */
    checkResult:
      u.check.value != null
        ? `${c.value(u.check.value)} over your last ${u.check.games}`
        : "",
    target: c.target,
  };
}
