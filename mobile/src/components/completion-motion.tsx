import { useMemo, type ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated, { cubicBezier, useReducedMotion, type CSSAnimationKeyframes } from "react-native-reanimated";
import { useTheme } from "@/lib/theme";

// Ported from web/src/index.css and web/src/styles/tokens.css.
const easeOut = cubicBezier(0.22, 1, 0.36, 1);
const bounce: CSSAnimationKeyframes = {
  "0%": { transform: [{ scale: 0.3 }], opacity: 0 },
  "35%": { transform: [{ scale: 1.12 }], opacity: 1 },
  "55%": { transform: [{ scale: 0.92 }] },
  "75%": { transform: [{ scale: 1.04 }] },
  "100%": { transform: [{ scale: 1 }], opacity: 1 },
};
const rise: CSSAnimationKeyframes = {
  from: { transform: [{ translateY: 10 }], opacity: 0 },
  to: { transform: [{ translateY: 0 }], opacity: 1 },
};
function mulberry32(initialSeed: number) {
  let seed = initialSeed;
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const completionDelays = {
  heading: 360,
  results: 405,
  stat: (order: number) => 450 + order * 80,
};

/** One entrance per mount; layout and button availability never wait on it. */
export function CompletionEntrance({ children, style, medal = false, delay = 0 }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  medal?: boolean;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return <Animated.View style={[style, !reduced && {
    animationName: medal ? bounce : rise,
    animationDuration: medal ? 900 : 300,
    animationDelay: delay,
    animationTimingFunction: easeOut,
    animationFillMode: "both",
    animationIterationCount: 1,
  }]}>{children}</Animated.View>;
}

/** Same seeded 36-piece burst, trajectories and timing as the web Confetti. */
export function CompletionConfetti() {
  const reduced = useReducedMotion();
  const { colors: c } = useTheme();
  const bits = useMemo(() => {
    const random = mulberry32(1);
    return Array.from({ length: 36 }, (_, i) => {
      const angle = (i / 36) * Math.PI * 2 + random() * 0.5;
      const power = 90 + random() * 110;
      const dx = Math.cos(angle) * power;
      const up = Math.min(0, Math.sin(angle) * power) - 40 - random() * 60;
      const fall = up + 140 + random() * 120;
      const spin = (random() < 0.5 ? -1 : 1) * (240 + random() * 480);
      const animationName: CSSAnimationKeyframes = {
        "0%": { transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: "0deg" }, { scale: 0.3 }], opacity: 1 },
        "35%": { transform: [{ translateX: dx * 0.75 }, { translateY: up }, { rotate: `${spin * 0.4}deg` }, { scale: 1 }] },
        "75%": { opacity: 1 },
        "100%": { transform: [{ translateX: dx }, { translateY: fall }, { rotate: `${spin}deg` }, { scale: 0.9 }], opacity: 0 },
      };
      return {
        animationName,
        ms: 1000 + random() * 600, delay: random() * 80, round: i % 3 === 0,
      };
    });
  }, []);
  if (reduced) return null;
  const colors = [c.brand, c.gold, c.sky, c.danger, c.moveBrilliant, c.gold];
  return <Animated.View pointerEvents="none" accessible={false} aria-hidden
    style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", zIndex: 1 }]}>
    {bits.map((bit, i) => <Animated.View key={i} style={{
      position: "absolute", width: bit.round ? 10 : 8, height: bit.round ? 10 : 14,
      borderRadius: bit.round ? 5 : 2, backgroundColor: colors[i % colors.length],
      animationName: bit.animationName,
      animationDuration: bit.ms, animationDelay: bit.delay,
      animationTimingFunction: easeOut, animationFillMode: "both", animationIterationCount: 1,
    }} />)}
  </Animated.View>;
}
