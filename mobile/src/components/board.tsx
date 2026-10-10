import { Chess, type Square, type Color } from "chess.js";
import { Pressable, View, StyleSheet, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { boardSquares, legalTargets } from "../lib/practice";
import { useTheme } from "../lib/theme";
import { BoardSizeContext } from "./board-size";
import { MovingPiece } from "./board-piece";
import { BoardFeedback } from "./board-feedback";
import {
  BoardArrows,
  BoardMark,
  type BoardArrow,
  type Classification,
} from "./board-marks";
import {
  piecesAt,
  transitionPieces,
  checkSquares,
  matePresentation,
  canDrop,
  moveBetween,
  MOVE_MS,
  type MoveSound,
} from "../lib/board-motion";
import { useBoardSound } from "../lib/board-sound";
import { useBoardHaptics } from "../lib/board-haptics";
import { Text } from "./ui";
import { PromotionChoice, type PromotionRequest } from "./promotion-choice";
export type { BoardArrow, Classification } from "./board-marks";
const names = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
};
const NO_ARROWS: BoardArrow[] = [];
type Drop = {
  from: Square;
  to: Square;
  fen: string;
  phase: "select" | "wait" | "submitted";
  busy: boolean;
};
export function Board({
  fen,
  promotion,
  initialFen,
  initialFlipped,
  animatePositions = false,
  ledge = true,
  selected,
  targets,
  flipped,
  hintSquare,
  hintMove,
  disabled,
  onSquare,
  flash,
  lastMove,
  arrows = NO_ARROWS,
  badge,
  inLine = false,
  movable,
  soundEnabled = true,
  hapticsEnabled = true,
  verdictHaptics = true,
  edgeInset = 0,
  onMove,
}: {
  fen: string;
  promotion?: PromotionRequest;
  initialFen?: string;
  initialFlipped?: boolean;
  animatePositions?: boolean;
  ledge?: boolean;
  selected: Square | null;
  targets: Square[];
  flipped: boolean;
  hintSquare?: string;
  hintMove?: string;
  disabled: boolean;
  onSquare: (square: Square) => void;
  flash?: { square: string; tone: "right" | "wrong"; id: number };
  lastMove?: { from: string; to: string };
  arrows?: BoardArrow[];
  badge?: { square: Square; kind: Classification } | null;
  inLine?: boolean;
  movable?: Color;
  soundEnabled?: boolean;
  hapticsEnabled?: boolean;
  /** Practice dispatches verdict haptics before rendering; pickup still stays enabled. */
  verdictHaptics?: boolean;
  /** Extend into the screen's horizontal padding while controls stay inset. */
  edgeInset?: number;
  /** Optional direct move callback; existing onSquare consumers also support drag. */
  onMove?: (from: Square, to: Square) => boolean | void;
}) {
  const { colors: c } = useTheme();
  const squareRefs = useRef(new Map<Square, View>());
  const chess = useMemo(() => new Chess(fen), [fen]);
  const check = useMemo(() => checkSquares(fen), [fen]);
  const moves = useMemo(() => {
    const bySquare = new Map<Square, Square[]>();
    for (const move of chess.moves({ verbose: true })) {
      const targets = bySquare.get(move.from) ?? [];
      if (!targets.includes(move.to)) targets.push(move.to);
      bySquare.set(move.from, targets);
    }
    return bySquare;
  }, [chess]);
  const squares = useMemo(() => boardSquares(flipped), [flipped]);
  const reduced = useReducedMotion();
  const measuredSize = useContext(BoardSizeContext);
  const [width, setWidth] = useState(measuredSize);
  const [drag, setDrag] = useState<{ from: Square; fen: string } | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [dropped, setDropped] = useState<{
    from: Square;
    to: Square;
    fen: string;
  } | null>(null);
  const [release, setRelease] = useState(0);
  const [shown, setShown] = useState(() => ({
    fen: initialFen ?? fen,
    fromPrevious: !!initialFen && initialFen !== fen,
    pieces: piecesAt(initialFen ?? fen),
    captured: [] as ReturnType<typeof piecesAt>,
    animate: false,
    mate: matePresentation(fen, fen, []),
    cue: null as { sound: MoveSound; delay: number; id: string } | null,
  }));
  if (shown.fen !== fen) {
    const transition = transitionPieces(shown.pieces, shown.fen, fen, shown.fromPrevious ? "always" : animatePositions);
    const move =
      dropped?.fen === shown.fen ? moveBetween(shown.fen, fen) : null;
    const landed =
      !!move && move.from === dropped?.from && move.to === dropped?.to;
    setShown({
      fen,
      fromPrevious: false,
      ...transition,
      mate: matePresentation(shown.fen, fen, shown.mate.seen),
      cue: transition.sound
        ? {
            sound: transition.sound,
            delay: landed || reduced ? 0 : MOVE_MS,
            id: fen,
          }
        : null,
    });
  }
  useBoardSound(
    shown.cue,
    soundEnabled,
    flash,
    badge && (badge.kind === "brilliant" || badge.kind === "great")
      ? { id: `${fen}-${badge.kind}`, delay: reduced ? 0 : MOVE_MS + 120 }
      : null,
  );
  const pickup = useBoardHaptics(
    hapticsEnabled,
    verdictHaptics ? flash : undefined,
  );
  const onTapSquare = useCallback(
    (square: Square) => {
      if (disabled) return;
      if (square !== selected && moves.has(square) &&
          !(selected && targets.includes(square))) pickup();
      onSquare(square);
    },
    [disabled, selected, moves, targets, pickup, onSquare],
  );
  // Bridge a drag to the existing controlled tap API, waiting for the source selection
  // to render before sending the destination. Grading stays entirely with the caller.
  useEffect(() => {
    if (!drop) return;
    const frame = requestAnimationFrame(() => {
      if (drop.fen !== fen || (disabled && drop.phase !== "submitted")) {
        setDrop(null);
        return;
      }
      if (drop.phase === "submitted") {
        if (disabled && !drop.busy) setDrop({ ...drop, busy: true });
        else if (!disabled && drop.busy) setDrop(null);
        return;
      }
      if (selected === drop.from) {
        setDrop({ ...drop, phase: "submitted" });
        onSquare(drop.to);
      } else if (drop.phase === "select") {
        setDrop({ ...drop, phase: "wait" });
        onSquare(drop.from);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [drop, selected, fen, disabled, onSquare]);
  useEffect(() => {
    // A caller that declines an input must not leave a piece suspended forever.
    if (!drop || disabled) return;
    const timer = setTimeout(() => setDrop(null), 1500);
    return () => clearTimeout(timer);
  }, [drop, disabled]);
  const activeDrag = drag?.fen === fen && !disabled ? drag.from : null;
  const selection = activeDrag ?? selected;
  const destinations = activeDrag ? legalTargets(fen, activeDrag) : targets;
  const onDragStart = useCallback(
    (from: Square) => {
      pickup();
      setDrag({ from, fen });
    },
    [fen, pickup],
  );
  const onDrop = useCallback(
    (from: Square, to: Square | null) => {
      setDrag(null);
      setRelease((value) => value + 1);
      if (disabled || !canDrop(fen, from, to)) return;
      setDropped({ from, to: to!, fen });
      if (onMove) {
        if (onMove(from, to!) === false) {
          setDropped(null);
          return;
        }
        setDrop({ from, to: to!, fen, phase: "submitted", busy: false });
      } else setDrop({ from, to: to!, fen, phase: "select", busy: false });
    },
    [disabled, fen, onMove],
  );
  const visibleArrows = hintMove
    ? [
        ...arrows,
        {
          from: hintMove.slice(0, 2),
          to: hintMove.slice(2, 4),
          tone: "best" as const,
        },
      ]
    : arrows;
  return (
    <GestureHandlerRootView
      style={[
        styles.base,
        !ledge && { paddingBottom: 0 },
        edgeInset > 0 && { marginHorizontal: -edgeInset, borderRadius: 0 },
        { backgroundColor: c.lip },
        inLine && { borderColor: c.sky, borderWidth: 2 },
      ]}
    >
      <View
        style={[styles.grid, edgeInset > 0 && { borderRadius: 0 }]}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        <View style={{ flex: 1 }} accessibilityElementsHidden={!!promotion} aria-hidden={!!promotion}
          importantForAccessibility={promotion ? "no-hide-descendants" : "auto"}
          pointerEvents={promotion ? "none" : "auto"}>
        {Array.from({ length: 8 }, (_, row) => (
          <View key={row} style={styles.row}>
            {squares.slice(row * 8, row * 8 + 8).map((square, column) => {
              const index = row * 8 + column,
                piece = chess.get(square);
              const isLight = (row + column) % 2 === 0;
              const target = destinations.includes(square);
              const highlighted =
                selection === square ||
                lastMove?.from === square ||
                lastMove?.to === square;
              return (
                <Pressable
                  key={square}
                  ref={view => { if (view) squareRefs.current.set(square, view); else squareRefs.current.delete(square); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${square}${piece ? `, ${piece.color === "w" ? "white" : "black"} ${names[piece.type]}` : ", empty"}${target ? ", legal destination" : ""}${check?.king === square ? ", in check" : ""}`}
                  accessibilityState={{
                    selected: selection === square,
                    disabled,
                  }}
                  disabled={disabled}
                  onPress={() => onTapSquare(square)}
                  style={[
                    styles.square,
                    {
                      backgroundColor: highlighted
                        ? isLight
                          ? inLine
                            ? c.lineHighlightLight
                            : c.boardHighlightLight
                          : inLine
                            ? c.lineHighlightDark
                            : c.boardHighlightDark
                        : isLight
                          ? c.boardLight
                          : c.boardDark,
                    },
                  ]}
                >
                  {check?.path.includes(square) && (
                    <View
                      pointerEvents="none"
                      style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: c.check, opacity: 0.38 },
                      ]}
                    />
                  )}
                  {check?.king === square && (
                    <View
                      pointerEvents="none"
                      style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: c.check },
                      ]}
                    />
                  )}
                  {target && (
                    <View
                      pointerEvents="none"
                      style={
                        piece
                          ? [styles.capture, { borderColor: c.moveHint }]
                          : [styles.dot, { backgroundColor: c.moveHint }]
                      }
                    />
                  )}
                  {hintSquare === square && (
                    <BoardFeedback key={`hint-${square}`} color={c.gold} hint />
                  )}
                  {flash?.square === square && (
                    <BoardFeedback
                      key={flash.id}
                      color={flash.tone === "right" ? c.brand : c.danger}
                      delay={shown.cue?.delay ?? MOVE_MS}
                    />
                  )}
                  {index % 8 === 0 && (
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.rank,
                        { color: isLight ? c.boardDark : c.boardLight },
                      ]}
                    >
                      {square[1]}
                    </Text>
                  )}
                  {index >= 56 && (
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.file,
                        { color: isLight ? c.boardDark : c.boardLight },
                      ]}
                    >
                      {square[0]}
                    </Text>
                  )}
                  {selection === square && (
                    <View
                      pointerEvents="none"
                      style={[
                        StyleSheet.absoluteFill,
                        { borderWidth: 3, borderColor: c.selected },
                      ]}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
        {width > 0 &&
          shown.pieces.map((piece) => (
            <MovingPiece
              key={piece.id}
              piece={piece}
              initialFlipped={initialFlipped}
              cell={width / 8}
              flipped={flipped}
              selected={selection === piece.square}
              fallen={piece.square === shown.mate.mated}
              fall={shown.mate.fall}
              animate={shown.animate}
              positionKey={fen}
              releaseKey={release}
              draggable={
                !disabled &&
                !drop &&
                piece.side === (movable ?? chess.turn()) &&
                !!moves.get(piece.square)?.length
              }
              destinations={moves.get(piece.square)}
              landing={
                promotion?.from === piece.square ? promotion.to :
                drop?.fen === fen && drop.from === piece.square
                  ? drop.to
                  : undefined
              }
              onTap={disabled || drop ? undefined : onTapSquare}
              landed={shown.cue?.delay === 0}
              onDragStart={onDragStart}
              onDrop={onDrop}
            />
          ))}
        {width > 0 &&
          shown.captured.map((piece) => (
            <MovingPiece
              key={`captured-${fen}-${piece.id}`}
              piece={piece}
              initialFlipped={initialFlipped}
              cell={width / 8}
              flipped={flipped}
              selected={false}
              fallen={false}
              animate
              captured
              positionKey={fen}
            />
          ))}
        {width > 0 && <BoardArrows arrows={visibleArrows} flipped={flipped} />}
        {width > 0 && hintSquare && /^[a-h][1-8]$/.test(hintSquare) && (
          <BoardMark
            square={hintSquare as Square}
            cell={width / 8}
            flipped={flipped}
            kind="hint"
          />
        )}
        {width > 0 && badge && (
          <BoardMark
            key={`badge-${fen}-${badge.kind}`}
            square={badge.square}
            cell={width / 8}
            flipped={flipped}
            kind={badge.kind}
            delay={reduced ? 0 : MOVE_MS}
          />
        )}
        {width > 0 && shown.mate.mated && (
          <BoardMark
            key={`mate-${fen}`}
            square={shown.mate.mated}
            cell={width / 8}
            flipped={flipped}
            kind="mated"
            delay={shown.mate.fall ? MOVE_MS + 820 : undefined}
          />
        )}
        {width > 0 && shown.mate.winner && (
          <BoardMark
            key={`winner-${fen}`}
            square={shown.mate.winner}
            cell={width / 8}
            flipped={flipped}
            kind="winner"
            delay={shown.mate.fall ? MOVE_MS + 980 : undefined}
          />
        )}
        </View>
        {promotion && width > 0 && (
          <PromotionChoice request={{ ...promotion, onCancel: () => {
            promotion.onCancel();
            if (Platform.OS === "web") requestAnimationFrame(() => squareRefs.current.get(promotion.from)?.focus());
          } }} size={width} flipped={flipped}
            side={chess.get(promotion.from)?.color ?? chess.turn()} />
        )}
      </View>
    </GestureHandlerRootView>
  );
}
const styles = StyleSheet.create({
  base: { paddingBottom: 4, borderRadius: 0 },
  grid: { width: "100%", aspectRatio: 1, overflow: "hidden", borderRadius: 0 },
  row: { flex: 1, flexDirection: "row", minHeight: 0 },
  square: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  dot: { position: "absolute", width: "30%", height: "30%", borderRadius: 30 },
  capture: {
    position: "absolute",
    width: "92%",
    height: "92%",
    borderWidth: 3,
    borderRadius: 40,
  },
  rank: { position: "absolute", top: 0, left: 3, fontSize: 10, lineHeight: 13 },
  file: {
    position: "absolute",
    bottom: 0,
    right: 3,
    fontSize: 10,
    lineHeight: 13,
  },
});
