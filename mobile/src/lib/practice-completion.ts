import { practiceSummary } from "./practice-flow.ts";

export type CompletionResult = {
  mark: string;
  ply: number;
  san: string;
  opponent: string | null;
  name?: string;
};

export function completionSummary(done: number, results: { mark: string }[]) {
  const counts = practiceSummary(results);
  const summary = ([
    [counts.found, "found"],
    [counts.helped, "with help"],
    [counts.missed, "missed"],
  ] as const).filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}`).join(", ");
  return `${done} position${done === 1 ? "" : "s"} reviewed.${summary ? ` ${summary}.` : ""}`;
}

export function revisitMoves(results: CompletionResult[]) {
  return results.filter(result => result.mark === "helped" || result.mark === "missed")
    .map(result => result.name ?? `${Math.ceil(result.ply / 2)}${result.ply % 2 ? ". " : "..."}${result.san}${result.opponent ? ` vs ${result.opponent}` : ""}`)
    .join(", ");
}
