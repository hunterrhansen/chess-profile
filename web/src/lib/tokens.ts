/** A design token's current value (styles/tokens.css), for the few places that can't take
 * `var(--…)`: SVG attributes a library draws, like the board's arrows. Read it at render time
 * so it follows the light/dark theme. */
export function token(name: `--${string}`) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
