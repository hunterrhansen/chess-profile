import { Chess, type Square } from "chess.js";
import { Pressable, View, StyleSheet } from "react-native";
import { boardSquares } from "../lib/practice";
import { useTheme } from "../lib/theme";
import Svg, { Line, Polygon } from "react-native-svg";
import { useState } from "react";
import { MovingPiece } from "./board-piece";
import { BoardFeedback } from "./board-feedback";
import { piecesAt, transitionPieces, coordinates } from "../lib/board-motion";
import { Text } from "./ui";
const names = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
};
export function Board({
  fen,
  selected,
  targets,
  flipped,
  hintSquare,
  hintMove,
  disabled,
  onSquare,
  flash,
  lastMove,
}: {
  fen: string;
  selected: Square | null;
  targets: Square[];
  flipped: boolean;
  hintSquare?: string;
  hintMove?: string;
  disabled: boolean;
  onSquare: (square: Square) => void;
  flash?: { square: string; tone: "right" | "wrong"; id: number };
  lastMove?: { from: string; to: string };
}) {
  const { colors: c } = useTheme();
  const chess = new Chess(fen);
  const squares = boardSquares(flipped);
  const [width, setWidth] = useState(0);
  const [shown, setShown] = useState(() => ({
    fen,
    pieces: piecesAt(fen),
    captured: [] as ReturnType<typeof piecesAt>,
    animate: false,
  }));
  if (shown.fen !== fen)
    setShown({ fen, ...transitionPieces(shown.pieces, shown.fen, fen) });
  const mated = chess.isCheckmate()
    ? chess.findPiece({ type: "k", color: chess.turn() })[0]
    : undefined;
  const winner = mated
    ? chess.findPiece({ type: "k", color: chess.turn() === "w" ? "b" : "w" })[0]
    : undefined;
  return (
    <View style={[styles.base, { backgroundColor: c.lip }]}>
      <View
        style={styles.grid}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {Array.from({ length: 8 }, (_, row) => (
          <View key={row} style={styles.row}>
            {squares.slice(row * 8, row * 8 + 8).map((square, column) => {
              const index = row * 8 + column;
              const piece = chess.get(square);
              const isLight = ((index % 8) + Math.floor(index / 8)) % 2 === 0;
              const target = targets.includes(square);
              const highlighted =
                selected === square ||
                hintSquare === square ||
                lastMove?.from === square ||
                lastMove?.to === square;
              return (
                <Pressable
                  key={square}
                  accessibilityRole="button"
                  accessibilityLabel={`${square}${piece ? `, ${piece.color === "w" ? "white" : "black"} ${names[piece.type]}` : ", empty"}${target ? ", legal destination" : ""}`}
                  accessibilityState={{
                    selected: selected === square,
                    disabled,
                  }}
                  disabled={disabled}
                  onPress={() => onSquare(square)}
                  style={[
                    styles.square,
                    {
                      backgroundColor: highlighted
                        ? isLight
                          ? c.boardHighlightLight
                          : c.boardHighlightDark
                        : isLight
                          ? c.boardLight
                          : c.boardDark,
                    },
                  ]}
                >
                  {target && (
                    <View
                      pointerEvents="none"
                      style={
                        piece
                          ? [styles.capture, { borderColor: c.selected }]
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
                    />
                  )}
                  {index % 8 === 0 && (
                    <Text
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
                      style={[
                        styles.file,
                        { color: isLight ? c.boardDark : c.boardLight },
                      ]}
                    >
                      {square[0]}
                    </Text>
                  )}
                  {selected === square && (
                    <View
                      pointerEvents="none"
                      style={[styles.selection, { borderColor: c.selected }]}
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
              cell={width / 8}
              flipped={flipped}
              selected={selected === piece.square}
              fallen={piece.square === mated}
              animate={shown.animate}
            />
          ))}
        {width > 0 &&
          shown.captured.map((piece) => (
            <MovingPiece
              key={`captured-${shown.fen}-${piece.id}`}
              piece={piece}
              cell={width / 8}
              flipped={flipped}
              selected={false}
              fallen={false}
              animate
              captured
            />
          ))}
        {width > 0 && hintMove && (
          <HintArrow uci={hintMove} flipped={flipped} color={c.brandText} />
        )}
        {width > 0 &&
          [mated, winner].map(
            (square, index) =>
              square && (
                <View
                  key={square}
                  pointerEvents="none"
                  style={[
                    styles.mateBadge,
                    {
                      top:
                        (Math.floor(squares.indexOf(square) / 8) * width) / 8 +
                        2,
                      left:
                        (((squares.indexOf(square) % 8) + 1) * width) / 8 - 22,
                      backgroundColor: index === 0 ? c.danger : c.gold,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      lineHeight: 18,
                      color: index === 0 ? c.onDanger : c.onGold,
                    }}
                  >
                    {index === 0 ? "#" : "♛"}
                  </Text>
                </View>
              ),
          )}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  base: { paddingBottom: 4, borderRadius: 14 },
  grid: {
    width: "100%",
    aspectRatio: 1,
    overflow: "hidden",
    borderRadius: 10,
  },
  // A fixed square board and eight equal rows keep empty cells independent of content.
  row: { flex: 1, flexDirection: "row", minHeight: 0 },
  square: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  mateBadge: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
  },
  piece: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  dot: { position: "absolute", width: "25%", height: "25%", borderRadius: 30 },
  capture: {
    position: "absolute",
    width: "88%",
    height: "88%",
    borderWidth: 3,
    borderRadius: 30,
  },
  selection: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderWidth: 3,
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

function HintArrow({
  uci,
  flipped,
  color,
}: {
  uci: string;
  flipped: boolean;
  color: string;
}) {
  const from = coordinates(uci.slice(0, 2) as Square, flipped),
    to = coordinates(uci.slice(2, 4) as Square, flipped);
  const x1 = from.x + 0.5,
    y1 = from.y + 0.5,
    x2 = to.x + 0.5,
    y2 = to.y + 0.5;
  const distance = Math.hypot(x2 - x1, y2 - y1);
  if (!distance) return null;
  const dx = (x2 - x1) / distance,
    dy = (y2 - y1) / distance;
  const baseX = x2 - dx * 0.55,
    baseY = y2 - dy * 0.55;
  return (
    <Svg
      pointerEvents="none"
      accessible={false}
      width="100%"
      height="100%"
      viewBox="0 0 8 8"
      style={{ position: "absolute", top: 0, left: 0, zIndex: 2 }}
    >
      <Line
        x1={x1}
        y1={y1}
        x2={baseX}
        y2={baseY}
        stroke={color}
        strokeWidth={0.16}
        opacity={0.8}
      />
      <Polygon
        points={`${x2},${y2} ${baseX - dy * 0.3},${baseY + dx * 0.3} ${baseX + dy * 0.3},${baseY - dx * 0.3}`}
        fill={color}
        opacity={0.8}
      />
    </Svg>
  );
}
