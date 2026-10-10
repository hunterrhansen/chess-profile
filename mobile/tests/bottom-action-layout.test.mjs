import test from "node:test";
import assert from "node:assert/strict";
import { bottomActionBandHeight } from "../src/lib/bottom-action-layout.ts";

test("default text keeps the existing 64px two-slot action band", () => {
  for (const width of [320, 390, 560, 1024]) {
    assert.equal(bottomActionBandHeight(width, 1), 64);
    assert.equal(bottomActionBandHeight(width, 0.85), 64);
  }
});

test("320px accessibility text fits three-line explanations and deck actions", () => {
  // 140px slots minus 20px padding/borders = 120px text width.
  // Nunito 800 at 26px: WHY THIS exceeds 120px, so WHY / THIS / MOVE?
  // need three 36px lines, plus 24px padding/borders and 4px ledge.
  assert.ok(bottomActionBandHeight(320, 2) >= 136);
});

test("very large text also reserves lines for wrapping within a long word", () => {
  // At 36.4px, MOVE? is 126.4px wide and PRACTICE is about 190px.
  // WHY / THIS / MOVE / ? therefore need four 50.4px lines.
  assert.ok(bottomActionBandHeight(320, 2.8) >= 230);
  // Wider 175px slots allow MOVE? to fit, leaving three lines.
  assert.ok(bottomActionBandHeight(390, 2.8) >= 180);
  assert.ok(bottomActionBandHeight(390, 2.8) < bottomActionBandHeight(320, 2.8));
});

test("height never shrinks when text grows or available width shrinks", () => {
  for (const width of [280, 320, 390, 560, 1024]) {
    let previous = 0;
    for (const scale of [1, 1.2, 1.5, 2, 2.5, 2.8, 3.2]) {
      const height = bottomActionBandHeight(width, scale);
      assert.ok(height >= previous, `${width}px at scale ${scale}`);
      previous = height;
      assert.ok(height >= bottomActionBandHeight(width + 40, scale));
    }
  }
});

test("the 560px content cap determines desktop slot width", () => {
  assert.equal(bottomActionBandHeight(1024, 2.8), bottomActionBandHeight(560, 2.8));
});
