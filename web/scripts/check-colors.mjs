// Fails when a color is written anywhere but src/styles/tokens.css: hex, rgb()/hsl()/oklch(),
// or a Tailwind palette class (bg-blue-500, text-white). Attribute selectors that match a
// library's own colors ([stroke='#ccc']) are fine. Use a token instead (bg-brand,
// text-danger-text, var(--move-best)); see docs/design.md. Run by `pnpm lint`.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('../src/', import.meta.url).pathname
const ALLOWED = {
  'styles/tokens.css': 'the tokens themselves',
  'lib/preferences.tsx': "the optional Brown/Green/Blue boards copy other sites' boards",
}

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const UTIL = 'bg|text|border|ring|fill|stroke|outline|decoration|from|via|to|shadow|accent|caret|divide|placeholder'
const RULES = [
  [/(?<![\w&/])(?<!=['"])#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i, 'hex color'],
  [/\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/, 'color function'],
  [new RegExp(`\\b(?:${UTIL})-(?:${PALETTE})-\\d{2,3}\\b`), 'Tailwind palette color'],
  [new RegExp(`\\b(?:${UTIL})-(?:black|white)\\b`), 'Tailwind black/white'],
]

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* files(path)
    else if (/\.(tsx?|css)$/.test(name)) yield path
  }
}

let problems = 0
for (const path of files(ROOT)) {
  const rel = relative(ROOT, path)
  if (rel in ALLOWED) continue
  readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
    for (const [re, what] of RULES) {
      const m = line.match(re)
      if (m) {
        console.log(`src/${rel}:${i + 1}: ${what} "${m[0]}"; use a token from styles/tokens.css`)
        problems++
      }
    }
  })
}
if (problems) {
  console.log(`\n${problems} raw color${problems === 1 ? '' : 's'}. Add a token to src/styles/tokens.css if none fits.`)
  process.exit(1)
}
