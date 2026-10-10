// Uppercase hmtx advances / unitsPerEm from the installed
// @expo-google-fonts/nunito/800ExtraBold/Nunito_800ExtraBold.ttf.
// Add 2% when measuring to allow for shaping/rounding differences. Recheck these
// metrics when the footer font changes; unknown characters use the widest glyph.
const advances: Record<string, number> = {
  " ": 0.279, A: 0.753, B: 0.695, C: 0.684, D: 0.774, E: 0.605,
  G: 0.742, H: 0.780, I: 0.297, K: 0.688, L: 0.573, M: 0.876,
  N: 0.753, O: 0.796, P: 0.664, R: 0.696, S: 0.641, T: 0.632,
  U: 0.743, V: 0.727, W: 1.120, Y: 0.631, "?": 0.468, "…": 0.780,
};
// Always reserve for every state: changing the visible action cannot move it.
const labels = [
  { text: "HINT", icon: true },
  { text: "SHOW PIECE", icon: true },
  { text: "SHOW MOVE", icon: true },
  { text: "HINT SHOWN", icon: true },
  ...["WHY THIS MOVE?", "PRACTICE AGAIN", "SEE YOUR DECK", "BACK HOME",
    "CONTINUE", "TRY AGAIN", "SHOW ME", "NEXT…"].map(text => ({ text, icon: false })),
];

function wrappedLines(text: string, available: number, fontSize: number): number {
  const widthOf = (value: string) => [...value].reduce(
    (width, character) => width + (advances[character] ?? 1.120) * fontSize * 1.02, 0);
  let lines = 1;
  let used = 0;
  for (const word of text.split(" ")) {
    const wordWidth = widthOf(word);
    if (wordWidth <= available) {
      const space = used ? widthOf(" ") : 0;
      if (used + space + wordWidth > available) {
        lines++;
        used = wordWidth;
      } else {
        used += space + wordWidth;
      }
    } else {
      // A long word can break within itself at accessibility text sizes.
      if (used) { lines++; used = 0; }
      for (const character of word) {
        const width = widthOf(character);
        if (used && used + width > available) { lines++; used = 0; }
        used += width;
      }
    }
  }
  return lines;
}

/** Shared two-column button height, including padding, borders and the ledge. */
export function bottomActionBandHeight(width: number, fontScale: number): number {
  const scale = Math.max(1, fontScale);
  const slotWidth = (Math.min(width, 560) - 32 - 8) / 2;
  const lines = Math.max(...labels.map(({ text, icon }) => wrappedLines(
    text, Math.max(1, slotWidth - 20 - (icon ? 22 + 6 : 0)), 13 * scale)));
  return Math.max(64, Math.ceil(lines * 18 * scale) + 28);
}
