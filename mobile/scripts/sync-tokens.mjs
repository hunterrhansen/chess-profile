import { readFileSync, writeFileSync } from "node:fs";
const css = readFileSync(
  new URL("../../web/src/styles/tokens.css", import.meta.url),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");
const keys = [
  "page",
  "surface",
  "surface-muted",
  "line",
  "lip",
  "ink",
  "ink-muted",
  "scrim",
  "brand",
  "brand-lip",
  "on-brand",
  "brand-text",
  "gold",
  "gold-lip",
  "on-gold",
  "sky",
  "sky-lip",
  "on-sky",
  "danger",
  "danger-lip",
  "on-danger",
  "danger-text",
  "board-light",
  "board-dark",
  "board-highlight-light",
  "board-highlight-dark",
  "selected",
  "move-hint",
  "piece-white",
  "piece-white-shade",
  "piece-black",
  "piece-black-shade",
  "piece-black-detail",
  "piece-outline",
  "piece-black-outline",
  "piece-black-eye",
];
const parse = (selector) =>
  Object.fromEntries(
    [
      ...css
        .match(new RegExp(`${selector}\\s*\\{([^}]+)`))[1]
        .matchAll(/--([\w-]+):\s*([^;]+);/g),
    ].map((m) => [m[1], m[2].trim()]),
  );
const light = parse(":root");
const dark = { ...light, ...parse("\\.dark") };
// React Native needs comma-separated rgba rather than CSS Color 4 rgb syntax.
const normalize = (color) =>
  color.replace(
    /rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)/g,
    (_, r, g, b, a) => `rgba(${r}, ${g}, ${b}, ${Number(a) / 100})`,
  );
const pick = (all) =>
  Object.fromEntries(
    keys.map((key) => [
      key.replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
      normalize(all[key].replace(/var\(--([\w-]+)\)/g, (_, ref) => all[ref])),
    ]),
  );
const output =
  "// Generated from web/src/styles/tokens.css by pnpm tokens:sync.\nexport const light = " +
  JSON.stringify(pick(light), null, 2) +
  " as const;\nexport const dark = " +
  JSON.stringify(pick(dark), null, 2) +
  " as const;\nexport type Palette = { [K in keyof typeof light]: string };\n";
const target = new URL("../src/lib/colors.ts", import.meta.url);
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== output)
    throw new Error("Mobile tokens differ from web. Run pnpm tokens:sync.");
} else writeFileSync(target, output);
