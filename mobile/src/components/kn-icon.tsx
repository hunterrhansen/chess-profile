import Svg, { Path, Rect, Circle, G } from "react-native-svg";
import { useTheme } from "@/lib/theme";
export type Glyph =
  | "home"
  | "games"
  | "play"
  | "progress"
  | "settings"
  | "goal"
  | "drill"
  | "review"
  | "trophy"
  | "notes"
  | "engine"
  | "lock"
  | "check"
  | "star"
  | "crown"
  | "hint";
export function KnIcon({ glyph, size = 32 }: { glyph: Glyph; size?: number }) {
  const { colors: c } = useTheme();
  const GLYPHS = {
    home: (
      <>
        <Path
          transform="translate(0 2)"
          fill={c.brandLip}
          d="M7 4h4v3h3V4h4v3h3V4h4v7l-3 3v9h3v3H7v-3h3v-9l-3-3z"
        />
        <Path
          fill={c.brand}
          d="M7 4h4v3h3V4h4v3h3V4h4v7l-3 3v9h3v3H7v-3h3v-9l-3-3z"
        />
        <Rect x="14" y="17" width="4" height="6" rx="2" fill={c.brandLip} />
      </>
    ),
    games: (
      <>
        <Rect x="4" y="6" width="24" height="24" rx="5" fill={c.brandLip} />
        <Rect x="4" y="4" width="24" height="24" rx="5" fill={c.boardDark} />
        <Path fill={c.boardLight} d="M4 16V9a5 5 0 0 1 5-5h7v12z" />
        <Path fill={c.boardLight} d="M28 16v7a5 5 0 0 1-5 5h-7V16z" />
      </>
    ),
    play: (
      <>
        <G transform="translate(0 2)" fill={c.skyLip}>
          <Path d="M9 24h14l-1-5c2-3 2-8-1-12-1-2-3-3-5-4l-1 2-2-1-3 3-4 5 1 3 4-1 2-1 1 2z" />
          <Rect x="7" y="23" width="18" height="5" rx="2.5" />
        </G>
        <Path
          fill={c.sky}
          d="M9 24h14l-1-5c2-3 2-8-1-12-1-2-3-3-5-4l-1 2-2-1-3 3-4 5 1 3 4-1 2-1 1 2z"
        />
        <Rect x="7" y="23" width="18" height="5" rx="2.5" fill={c.sky} />
        <Circle cx="13.5" cy="9.5" r="1.4" fill={c.onSky} />
      </>
    ),
    progress: (
      <>
        <G transform="translate(0 2)" fill={c.goldLip}>
          <Rect x="4" y="16" width="7" height="11" rx="2.5" />
          <Rect x="12.5" y="10" width="7" height="17" rx="2.5" />
          <Rect x="21" y="4" width="7" height="23" rx="2.5" />
        </G>
        <G fill={c.gold}>
          <Rect x="4" y="16" width="7" height="11" rx="2.5" />
          <Rect x="12.5" y="10" width="7" height="17" rx="2.5" />
          <Rect x="21" y="4" width="7" height="23" rx="2.5" />
        </G>
      </>
    ),
    settings: (
      <>
        <Circle
          cx="16"
          cy="16"
          r="11"
          fill={"none"}
          stroke={c.inkMuted}
          strokeWidth={5}
          strokeDasharray={"4.3 4.34"}
        />
        <Circle cx="16" cy="16" r="9" fill={c.inkMuted} />
        <Circle cx="16" cy="16" r="3.5" fill={c.surface} />
      </>
    ),
    goal: (
      <>
        <Rect x="6" y="3" width="3.5" height="26" rx="1.75" fill={c.inkMuted} />
        <Path
          transform="translate(0 2)"
          fill={c.dangerLip}
          d="M9.5 4H26l-4 6 4 6H9.5z"
        />
        <Path fill={c.danger} d="M9.5 4H26l-4 6 4 6H9.5z" />
      </>
    ),
    drill: (
      <>
        <Circle cx="16" cy="17" r="12.5" fill={c.dangerLip} />
        <Circle cx="16" cy="15" r="12.5" fill={c.danger} />
        <Circle cx="16" cy="15" r="8" fill={c.surface} />
        <Circle cx="16" cy="15" r="4" fill={c.danger} />
      </>
    ),
    review: (
      <>
        <Path
          d="M20 20l7 7"
          stroke={c.skyLip}
          strokeWidth={5.5}
          strokeLinecap={"round"}
        />
        <Circle cx="13.5" cy="15.5" r="9.5" fill={c.skyLip} />
        <Circle cx="13.5" cy="13.5" r="9.5" fill={c.sky} />
        <Circle cx="13.5" cy="13.5" r="5" fill={c.surface} />
      </>
    ),
    trophy: (
      <>
        <Path
          d="M9 8H5.5a1 1 0 0 0-1 1c0 4 2.5 6.5 6 6.5M23 8h3.5a1 1 0 0 1 1 1c0 4-2.5 6.5-6 6.5"
          fill={"none"}
          stroke={c.goldLip}
          strokeWidth={2.5}
          strokeLinecap={"round"}
        />
        <G transform="translate(0 2)" fill={c.goldLip}>
          <Path d="M9 4h14v7a7 7 0 0 1-14 0z" />
          <Rect x="9.5" y="22" width="13" height="5" rx="2.5" />
        </G>
        <Path fill={c.gold} d="M9 4h14v7a7 7 0 0 1-14 0z" />
        <Rect x="14" y="17" width="4" height="6" fill={c.goldLip} />
        <Rect x="9.5" y="22" width="13" height="5" rx="2.5" fill={c.gold} />
      </>
    ),
    notes: (
      <>
        <Rect x="6" y="5" width="20" height="24" rx="4.5" fill={c.goldLip} />
        <Rect x="6" y="3" width="20" height="24" rx="4.5" fill={c.gold} />
        <Rect
          x="10.5"
          y="9"
          width="11"
          height="2.5"
          rx="1.25"
          fill={c.goldLip}
        />
        <Rect
          x="10.5"
          y="14"
          width="11"
          height="2.5"
          rx="1.25"
          fill={c.goldLip}
        />
        <Rect
          x="10.5"
          y="19"
          width="7"
          height="2.5"
          rx="1.25"
          fill={c.goldLip}
        />
      </>
    ),
    engine: (
      <>
        <Rect x="15" y="4" width="2.5" height="6" rx="1.25" fill={c.inkMuted} />
        <Circle cx="16.25" cy="4.5" r="2.5" fill={c.brand} />
        <Rect x="5" y="11" width="22" height="17" rx="6" fill={c.inkMuted} />
        <Rect x="5" y="9" width="22" height="17" rx="6" fill={c.ink} />
        <Circle cx="11.5" cy="17" r="2.6" fill={c.brand} />
        <Circle cx="20.5" cy="17" r="2.6" fill={c.brand} />
      </>
    ),
    lock: (
      <>
        <Path
          d="M10.5 15v-4a5.5 5.5 0 0 1 11 0v4"
          fill={"none"}
          stroke={c.inkMuted}
          strokeWidth={3.2}
        />
        <Rect x="7" y="16" width="18" height="13" rx="4" fill={c.lip} />
        <Rect x="7" y="14" width="18" height="13" rx="4" fill={c.line} />
        <Circle cx="16" cy="20.5" r="2.2" fill={c.inkMuted} />
      </>
    ),
    check: (
      <>
        <Circle cx="16" cy="17" r="12.5" fill={c.brandLip} />
        <Circle cx="16" cy="15" r="12.5" fill={c.brand} />
        <Path
          d="M10 15.5l4 4 8-8"
          fill={"none"}
          stroke={c.onBrand}
          strokeWidth={3.5}
          strokeLinecap={"round"}
          strokeLinejoin={"round"}
        />
      </>
    ),
    star: (
      <>
        <Path
          transform="translate(0 2)"
          fill={c.goldLip}
          stroke={c.goldLip}
          strokeWidth={2.5}
          strokeLinejoin={"round"}
          d="M16 3.5l3.8 7.7 8.5 1.2-6.2 6 1.5 8.4L16 22.8l-7.6 4 1.5-8.4-6.2-6 8.5-1.2z"
        />
        <Path
          fill={c.gold}
          stroke={c.gold}
          strokeWidth={2.5}
          strokeLinejoin={"round"}
          d="M16 3.5l3.8 7.7 8.5 1.2-6.2 6 1.5 8.4L16 22.8l-7.6 4 1.5-8.4-6.2-6 8.5-1.2z"
        />
      </>
    ),
    crown: (
      <>
        <Path
          transform="translate(0 2)"
          fill={c.goldLip}
          stroke={c.goldLip}
          strokeWidth={2}
          strokeLinejoin={"round"}
          d="M5 10l6 5 5-9 5 9 6-5-2.5 15h-17z"
        />
        <Path
          fill={c.gold}
          stroke={c.gold}
          strokeWidth={2}
          strokeLinejoin={"round"}
          d="M5 10l6 5 5-9 5 9 6-5-2.5 15h-17z"
        />
        <Circle cx="16" cy="18" r="2.2" fill={c.goldLip} />
      </>
    ),
    // Hint: a gold bulb on its ledge, with a glint, over a grey base.
    hint: (
      <>
        <Path
          transform="translate(0 2)"
          fill={c.goldLip}
          d="M16 3a9 9 0 0 0-5.4 16.2c1 .8 1.4 1.7 1.4 2.8v.5h8v-.5c0-1.1.4-2 1.4-2.8A9 9 0 0 0 16 3z"
        />
        <Path
          fill={c.gold}
          d="M16 3a9 9 0 0 0-5.4 16.2c1 .8 1.4 1.7 1.4 2.8v.5h8v-.5c0-1.1.4-2 1.4-2.8A9 9 0 0 0 16 3z"
        />
        <Path
          d="M11.6 10.4a4.6 4.6 0 0 1 3.6-3.5"
          fill={"none"}
          stroke={c.surface}
          strokeWidth={2.2}
          strokeLinecap={"round"}
        />
        <Rect
          x="11.5"
          y="25"
          width="9"
          height="2.8"
          rx="1.4"
          fill={c.inkMuted}
        />
        <Rect
          x="13"
          y="28.4"
          width="6"
          height="2.4"
          rx="1.2"
          fill={c.inkMuted}
        />
      </>
    ),
  } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      {GLYPHS[glyph]}
    </Svg>
  );
}
