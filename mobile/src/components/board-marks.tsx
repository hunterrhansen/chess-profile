import { useEffect, type ReactNode } from "react";
import { StyleSheet } from "react-native";
import type { Square } from "chess.js";
import Svg, { Path, Line, Polygon, G } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  withSpring,
  cancelAnimation,
  ReduceMotion,
  useReducedMotion,
} from "react-native-reanimated";
import { coordinates } from "../lib/board-motion";
import { useTheme } from "../lib/theme";
import { Text } from "./ui";
export type BoardArrow = {
  from: string;
  to: string;
  tone: "best" | "line" | "danger";
};
export type Classification =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "miss";
const symbols: Record<Classification, string> = {
  brilliant: "!!",
  great: "!",
  best: "★",
  excellent: "",
  good: "✓",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
  miss: "×",
};
function SparkleRing({ color, delay }: { color: string; delay: number }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0),
    scale = useSharedValue(1);
  useEffect(() => {
    if (reduced) {
      opacity.set(0);
      return;
    }
    opacity.set(
      withDelay(
        delay,
        withTiming(0.55, { duration: 50, reduceMotion: ReduceMotion.System }),
        ReduceMotion.System,
      ),
    );
    scale.set(
      withDelay(
        delay,
        withTiming(
          1.8,
          { duration: 450, reduceMotion: ReduceMotion.System },
          () => {
            opacity.set(withTiming(0, { duration: 100 }));
          },
        ),
        ReduceMotion.System,
      ),
    );
    return () => {
      cancelAnimation(opacity);
      cancelAnimation(scale);
    };
  }, [color, delay, reduced, opacity, scale]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: scale.get() }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { borderRadius: 30, borderWidth: 2, borderColor: color },
        style,
      ]}
    />
  );
}
export function BoardArrows({
  arrows,
  flipped,
}: {
  arrows: BoardArrow[];
  flipped: boolean;
}) {
  const { colors: c } = useTheme();
  return (
    <Svg
      pointerEvents="none"
      aria-hidden={true}
      width="100%"
      height="100%"
      viewBox="0 0 8 8"
      style={styles.arrows}
    >
      {arrows.map((arrow, index) => {
        if (!/^[a-h][1-8]$/.test(arrow.from) || !/^[a-h][1-8]$/.test(arrow.to))
          return null;
        const from = coordinates(arrow.from as Square, flipped),
          to = coordinates(arrow.to as Square, flipped);
        const x1 = from.x + 0.5,
          y1 = from.y + 0.5,
          x2 = to.x + 0.5,
          y2 = to.y + 0.5;
        const distance = Math.hypot(x2 - x1, y2 - y1);
        if (!distance) return null;
        const dx = (x2 - x1) / distance,
          dy = (y2 - y1) / distance;
        const bx = x2 - dx * 0.55,
          by = y2 - dy * 0.55;
        const color = {
          best: c.arrowBest,
          line: c.arrowLine,
          danger: c.arrowDanger,
        }[arrow.tone];
        return (
          <G key={`${arrow.from}-${arrow.to}-${index}`}>
            <Line
              x1={x1}
              y1={y1}
              x2={bx}
              y2={by}
              stroke={color}
              strokeWidth={0.16}
            />
            <Polygon
              points={`${x2},${y2} ${bx - dy * 0.3},${by + dx * 0.3} ${bx + dy * 0.3},${by - dx * 0.3}`}
              fill={color}
            />
          </G>
        );
      })}
    </Svg>
  );
}
function Mark({
  square,
  cell,
  flipped,
  color,
  label,
  delay,
  children,
}: {
  square: Square;
  cell: number;
  flipped: boolean;
  color: string;
  label: string;
  delay?: number;
  children: ReactNode;
}) {
  const { colors: c } = useTheme();
  const point = coordinates(square, flipped);
  const size = Math.min(28, cell * 0.42);
  const opacity = useSharedValue(delay === undefined ? 1 : 0);
  const scale = useSharedValue(delay === undefined ? 1 : 0.95);
  useEffect(() => {
    opacity.set(
      delay === undefined
        ? 1
        : withDelay(
            delay,
            withTiming(1, { duration: 100, reduceMotion: ReduceMotion.System }),
            ReduceMotion.System,
          ),
    );
    scale.set(
      delay === undefined
        ? 1
        : withDelay(
            delay,
            withSpring(1, {
              duration: 300,
              dampingRatio: 0.8,
              reduceMotion: ReduceMotion.System,
            }),
            ReduceMotion.System,
          ),
    );
    return () => {
      cancelAnimation(opacity);
      cancelAnimation(scale);
    };
  }, [delay, opacity, scale]);
  const animated = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: scale.get() }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          borderColor: c.surface,
          top: point.y * cell + 2,
          left: (point.x + 1) * cell - size - 2,
        },
        animated,
      ]}
    >
      {children}
    </Animated.View>
  );
}
export function BoardMark({
  square,
  cell,
  flipped,
  kind,
  delay,
}: {
  square: Square;
  cell: number;
  flipped: boolean;
  kind: Classification | "hint" | "mated" | "winner";
  delay?: number;
}) {
  const { colors: c } = useTheme();
  const colors: Record<Classification, string> = {
    brilliant: c.moveBrilliant,
    great: c.moveGreat,
    best: c.moveBest,
    excellent: c.moveExcellent,
    good: c.moveGood,
    inaccuracy: c.moveInaccuracy,
    mistake: c.moveMistake,
    blunder: c.moveBlunder,
    miss: c.moveMiss,
  };
  const color =
    kind === "hint" || kind === "winner"
      ? c.gold
      : kind === "mated"
        ? c.danger
        : colors[kind];
  return (
    <Mark
      square={square}
      cell={cell}
      flipped={flipped}
      color={color}
      label={
        kind === "mated"
          ? "Checkmate"
          : kind === "winner"
            ? "Winner"
            : kind === "hint"
              ? "Hint: move this piece"
              : `${kind} move`
      }
      delay={delay}
    >
      {(kind === "brilliant" || kind === "great") && delay !== undefined && (
        <SparkleRing color={color} delay={delay + 120} />
      )}
      {kind === "hint" || kind === "winner" || kind === "excellent" ? (
        <Svg width="72%" height="72%" viewBox="0 0 24 24">
          <Path
            fill={kind === "excellent" ? c.onMove : c.onGold}
            d={
              kind === "hint"
                ? "M9 18h6v2H9z M12 2.5a7 7 0 0 0-4.2 12.6c.7.5 1.2 1.3 1.2 2.2V17h6v-.7c0-.9.5-1.7 1.2-2.2A7 7 0 0 0 12 2.5z"
                : kind === "excellent"
                  ? "M3 10h4v11H3z M9 10l4-8c3 0 3 3 2 7h5c2 0 2 2 1 4l-2 7H9z"
                  : "M3 6l5 4 4-7 4 7 5-4-3 13H6z"
            }
          />
        </Svg>
      ) : (
        <Text
          allowFontScaling={false}
          style={{
            fontSize: Math.min(15, cell * 0.26),
            color: kind === "mated" ? c.onDanger : c.onMove,
            lineHeight: 18,
          }}
        >
          {kind === "mated" ? "#" : symbols[kind]}
        </Text>
      )}
    </Mark>
  );
}
const styles = StyleSheet.create({
  arrows: { position: "absolute", top: 0, left: 0, zIndex: 4 },
  mark: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    zIndex: 7,
  },
});
