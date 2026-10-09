import { useEffect, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  withSpring,
  withSequence,
  ReduceMotion,
  cancelAnimation,
} from "react-native-reanimated";
import {
  type BoardPiece,
  coordinates,
  resolveDrop,
  MOVE_MS,
} from "../lib/board-motion";
import type { Square } from "chess.js";
import { Piece } from "./piece";

export function MovingPiece({
  piece,
  cell,
  flipped,
  selected,
  fallen,
  captured = false,
  animate,
  fall = false,
  positionKey,
  draggable = false,
  destinations = [],
  landing,
  landed = false,
  releaseKey = 0,
  onTap,
  onDragStart,
  onDrop,
}: {
  piece: BoardPiece;
  cell: number;
  flipped: boolean;
  selected: boolean;
  fallen: boolean;
  captured?: boolean;
  animate: boolean;
  fall?: boolean;
  positionKey: string;
  draggable?: boolean;
  destinations?: Square[];
  landing?: Square;
  landed?: boolean;
  releaseKey?: number;
  onTap?: (square: Square) => void;
  onDragStart?: (square: Square) => void;
  onDrop?: (from: Square, to: Square | null) => void;
}) {
  const point = coordinates(piece.square, flipped);
  const x = useSharedValue(point.x * cell),
    y = useSharedValue(point.y * cell);
  const dx = useSharedValue(0),
    dy = useSharedValue(0),
    dragging = useSharedValue(false);
  const grabX = useSharedValue(0),
    grabY = useSharedValue(0);
  const scale = useSharedValue(1),
    opacity = useSharedValue(1);
  const angle = useSharedValue(fallen && !fall ? -90 : 0);
  const previousCell = useSharedValue(cell),
    previousFlipped = useSharedValue(flipped);
  const held = useSharedValue(false);
  useEffect(() => {
    const snap =
      !animate ||
      held.get() ||
      previousCell.get() !== cell ||
      previousFlipped.get() !== flipped;
    const config = {
      duration: MOVE_MS,
      easing: Easing.bezier(0.65, 0, 0.35, 1),
      reduceMotion: ReduceMotion.System,
    };
    x.set(snap ? point.x * cell : withTiming(point.x * cell, config));
    y.set(snap ? point.y * cell : withTiming(point.y * cell, config));
    dx.set(0);
    dy.set(0);
    held.set(false);
    dragging.set(false);
    previousCell.set(cell);
    previousFlipped.set(flipped);
  }, [
    point.x,
    point.y,
    cell,
    flipped,
    animate,
    positionKey,
    x,
    y,
    dx,
    dy,
    held,
    dragging,
    previousCell,
    previousFlipped,
  ]);
  useEffect(() => {
    // Keep a legal drop under the finger while server grading is pending.
    // Clearing the landing on a rejected request returns it to its original square.
    if (landing) {
      const destination = coordinates(landing, flipped);
      dx.set(destination.x * cell - point.x * cell);
      dy.set(destination.y * cell - point.y * cell);
      held.set(true);
    } else if (held.get()) {
      held.set(false);
      dx.set(
        withSpring(0, {
          duration: 400,
          dampingRatio: 0.8,
          reduceMotion: ReduceMotion.System,
        }),
      );
      dy.set(
        withSpring(0, {
          duration: 400,
          dampingRatio: 0.8,
          reduceMotion: ReduceMotion.System,
        }),
      );
    }
  }, [landing, releaseKey, cell, flipped, point.x, point.y, dx, dy, held]);
  useEffect(() => {
    scale.set(
      withTiming(selected ? 1.08 : 1, {
        duration: 120,
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [selected, scale]);
  const previousSquare = useRef(piece.square);
  useEffect(() => {
    const moved = previousSquare.current !== piece.square;
    previousSquare.current = piece.square;
    if (!moved || !animate || captured || fallen || selected) return;
    // Only the moving piece settles; replay jumps and stationary pieces stay still.
    scale.set(withSequence(
      withDelay(landed ? 0 : MOVE_MS,
        withTiming(0.97, { duration: 60, reduceMotion: ReduceMotion.System }),
        ReduceMotion.System),
      withTiming(1, { duration: 110, reduceMotion: ReduceMotion.System }),
    ));
  }, [piece.square, animate, captured, fallen, selected, landed, scale]);
  useEffect(() => {
    opacity.set(
      captured
        ? withDelay(MOVE_MS - 60, withTiming(0, {
            duration: 100,
            reduceMotion: ReduceMotion.System,
          }), ReduceMotion.System)
        : 1,
    );
  }, [captured, opacity]);
  useEffect(() => {
    angle.set(
      fallen
        ? fall
          ? withDelay(
              MOVE_MS + 380,
              withTiming(-90, {
                duration: 420,
                easing: Easing.out(Easing.back(1.3)),
                reduceMotion: ReduceMotion.System,
              }),
              ReduceMotion.System,
            )
          : -90
        : 0,
    );
    return () => cancelAnimation(angle);
  }, [fallen, fall, angle]);
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(draggable)
      .minDistance(5)
      .maxPointers(1)
      .onBegin((event) => {
        grabX.set(event.absoluteX);
        grabY.set(event.absoluteY);
      })
      .onStart((event) => {
        cancelAnimation(x);
        cancelAnimation(y);
        cancelAnimation(dx);
        cancelAnimation(dy);
        dx.set(event.absoluteX - grabX.get());
        dy.set(event.absoluteY - grabY.get());
        dragging.set(true);
        if (onDragStart) scheduleOnRN(onDragStart, piece.square);
      })
      .onUpdate((event) => {
        dx.set(event.absoluteX - grabX.get());
        dy.set(event.absoluteY - grabY.get());
      })
      .onEnd((event, success) => {
        const to = resolveDrop(
          success,
          point.x * cell + event.absoluteX - grabX.get() + cell / 2,
          point.y * cell + event.absoluteY - grabY.get() + cell / 2,
          cell * 8,
          flipped,
          destinations,
        );
        if (to) {
          const column = to.charCodeAt(0) - 97;
          const row = 8 - Number(to[1]);
          dx.set((flipped ? 7 - column : column) * cell - point.x * cell);
          dy.set((flipped ? 7 - row : row) * cell - point.y * cell);
          held.set(true);
        } else {
          dx.set(
            withSpring(0, {
              duration: 400,
              dampingRatio: 0.8,
              velocity: event.velocityX,
              reduceMotion: ReduceMotion.System,
            }),
          );
          dy.set(
            withSpring(0, {
              duration: 400,
              dampingRatio: 0.8,
              velocity: event.velocityY,
              reduceMotion: ReduceMotion.System,
            }),
          );
        }
        dragging.set(false);
        if (onDrop) scheduleOnRN(onDrop, piece.square, to);
      })
      .onFinalize((_event, success) => {
        if (!success) {
          dragging.set(false);
          dx.set(
            withSpring(0, {
              duration: 400,
              dampingRatio: 1,
              reduceMotion: ReduceMotion.System,
            }),
          );
          dy.set(
            withSpring(0, {
              duration: 400,
              dampingRatio: 1,
              reduceMotion: ReduceMotion.System,
            }),
          );
          if (onDrop) scheduleOnRN(onDrop, piece.square, null);
        }
      });
    const tap = Gesture.Tap()
      .enabled(!!onTap && !captured)
      .onEnd((_event, success) => {
        if (success && onTap) scheduleOnRN(onTap, piece.square);
      });
    return Gesture.Race(pan, tap);
  }, [
    draggable,
    onDragStart,
    onDrop,
    onTap,
    captured,
    piece.square,
    point.x,
    point.y,
    cell,
    flipped,
    destinations,
    x,
    y,
    dx,
    dy,
    grabX,
    grabY,
    dragging,
    held,
  ]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    zIndex: dragging.get() || held.get() ? 6 : selected ? 3 : 1,
    transform: [
      { translateX: x.get() + dx.get() },
      { translateY: y.get() + dy.get() },
      { scale: dragging.get() ? 1.08 : scale.get() },
      { rotate: `${angle.get()}deg` },
    ],
  }));
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        pointerEvents={onTap && !captured ? "auto" : "none"}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.piece, { width: cell, height: cell }, style]}
      >
        <Piece kind={piece.kind} side={piece.side} />
      </Animated.View>
    </GestureDetector>
  );
}
const styles = StyleSheet.create({
  piece: {
    position: "absolute",
    top: 0,
    left: 0,
    justifyContent: "center",
    alignItems: "center",
  },
});
