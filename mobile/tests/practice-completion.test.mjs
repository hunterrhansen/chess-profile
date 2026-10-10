import test from "node:test";
import assert from "node:assert/strict";
import { completionSummary, revisitMoves } from "../src/lib/practice-completion.ts";

test("completion keeps independent, helped and missed first attempts separate", () => {
  assert.equal(completionSummary(4, ["found", "good", "helped", "missed"].map(mark => ({ mark }))),
    "4 positions reviewed. 2 found, 1 with help, 1 missed.");
  assert.equal(completionSummary(1, [{ mark: "found" }]), "1 position reviewed. 1 found.");
  assert.equal(completionSummary(0, []), "0 positions reviewed.");
});

test("revisit list keeps original move number, side and optional opponent", () => {
  assert.equal(revisitMoves([
    { mark: "found", ply: 1, san: "e4", opponent: "A" },
    { mark: "helped", ply: 37, san: "Bxg4", opponent: "Mohamed_gfx" },
    { mark: "missed", ply: 38, san: "Bc8", opponent: null },
  ]), "19. Bxg4 vs Mohamed_gfx, 19...Bc8");
  assert.equal(revisitMoves([]), "");
  assert.equal(revisitMoves([{ mark: "helped", name: "Position 2", ply: 1, san: "Rh8#", opponent: null }]), "Position 2");
});
