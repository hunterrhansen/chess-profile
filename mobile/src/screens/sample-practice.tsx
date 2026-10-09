import { useEffect, useState } from "react";
import { Chess, type Square } from "chess.js";
import {
  ScrollView,
  View,
  StyleSheet,
  Switch,
  AccessibilityInfo,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Board } from "../components/board";
import { Logo } from "../components/logo";
import { HelpDialog } from "../components/help-dialog";
import { Text, Button, Card, Progress } from "../components/ui";
import { exercises, legalTargets, evaluateMove } from "../lib/practice";
import { useTheme, fonts } from "../lib/theme";
export default function PracticePreview() {
  const { colors: c, isDark, setMode } = useTheme();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Square | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [hint, setHint] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [done, setDone] = useState(false);
  const exercise = exercises[index];
  const [flash, setFlash] = useState<{
    square: string;
    tone: "right" | "wrong";
    id: number;
  }>();
  const [lastMove, setLastMove] = useState<{ from: string; to: string }>();
  const [returning, setReturning] = useState(false);
  const [playedFen, setPlayedFen] = useState<string | null>(null);
  useEffect(() => {
    if (!returning) return;
    const timer = setTimeout(() => {
      setPlayedFen(null);
      setReturning(false);
      setLastMove(undefined);
    }, 750);
    return () => clearTimeout(timer);
  }, [returning]);
  const targets =
    selected && !correct ? legalTargets(exercise.fen, selected) : [];
  const reset = (next = 0) => {
    setIndex(next);
    setSelected(null);
    setHint(false);
    setCorrect(false);
    setWrong(false);
    setPlayedFen(null);
    setFlash(undefined);
    setLastMove(undefined);
    setReturning(false);
    setDone(false);
  };
  function onSquare(square: Square) {
    if (correct || returning) return;
    const chess = new Chess(exercise.fen);
    const piece = chess.get(square);
    if (piece?.color === chess.turn()) {
      setSelected(selected === square ? null : square);
      setWrong(false);
      return;
    }
    if (!selected || !targets.includes(square)) return;
    const answer = evaluateMove(exercise, selected, square);
    setSelected(null);
    setWrong(!answer.correct);
    if (Platform.OS !== "web")
      AccessibilityInfo.announceForAccessibility(
        answer.correct
          ? "You found checkmate."
          : "Try another move. The position will reset.",
      );
    setFlash({
      square,
      tone: answer.correct ? "right" : "wrong",
      id: Date.now(),
    });
    setLastMove({ from: selected, to: square });
    setPlayedFen(answer.fen);
    if (!answer.correct) setReturning(true);
    if (answer.correct) {
      setCorrect(true);
      setPlayedFen(answer.fen);
    }
  }
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.page }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          <View style={styles.header}>
            <Logo />
            <HelpDialog />
          </View>
          <View style={styles.theme}>
            <Text tone="muted" style={styles.small}>
              LOCAL PRACTICE PREVIEW
            </Text>
            <View style={styles.row}>
              <Text tone="muted" style={styles.small}>
                Dark
              </Text>
              <Switch
                accessibilityLabel="Dark appearance"
                value={isDark}
                onValueChange={(value) => setMode(value ? "dark" : "light")}
                trackColor={{ false: c.line, true: c.brand }}
                thumbColor={c.surface}
              />
            </View>
          </View>
          <View style={styles.rowBetween}>
            <Text tone="brand" style={{ fontFamily: fonts.bold }}>
              Daily practice
            </Text>
            <Text tone="muted">{done ? 2 : index + (correct ? 1 : 0)} / 2</Text>
          </View>
          <Progress value={done ? 2 : index + (correct ? 1 : 0)} total={2} />
          {done ? (
            <View style={styles.finished}>
              <Text style={{ fontSize: 48, lineHeight: 60 }}>♛</Text>
              <Text heading style={styles.title}>
                Nicely done.
              </Text>
              <Text tone="muted" style={{ textAlign: "center" }}>
                Two ideas to take into your next game.
              </Text>
              <Card>
                <Text heading style={{ fontSize: 22 }}>
                  Back rank, locked down.
                </Text>
                <Text tone="muted">
                  Look for a king trapped behind its own pawns. A rook can
                  finish the game in a single move.
                </Text>
              </Card>
              <Button
                label="Practice again"
                variant="gold"
                onPress={() => reset()}
              />
            </View>
          ) : (
            <>
              <View style={{ gap: 4 }}>
                <Text heading accessibilityRole="header" style={styles.title}>
                  {exercise.title}
                </Text>
                <Text tone="muted">White to move · Find checkmate in one.</Text>
              </View>
              <Board
                key={index}
                flash={flash}
                lastMove={lastMove}
                fen={playedFen ?? exercise.fen}
                selected={selected}
                targets={targets}
                flipped={flipped}
                hintSquare={
                  hint && !correct ? exercise.solution.slice(0, 2) : undefined
                }
                disabled={correct || returning}
                onSquare={onSquare}
              />
              <View style={styles.row}>
                <View style={styles.grow}>
                  <Button
                    label={hint ? "Hint shown" : "Hint"}
                    variant="secondary"
                    disabled={hint || correct}
                    onPress={() => {
                      setHint(true);
                      setWrong(false);
                    }}
                  />
                </View>
                <View style={styles.grow}>
                  <Button
                    label="Flip board"
                    variant="secondary"
                    onPress={() => setFlipped(!flipped)}
                  />
                </View>
              </View>
              <View accessibilityLiveRegion="polite">
                <Card>
                  <Text heading style={{ fontSize: 22 }}>
                    {correct
                      ? "✓ You found it!"
                      : wrong
                        ? "Try another move"
                        : hint
                          ? "Look at the back rank"
                          : "Your move"}
                  </Text>
                  <Text tone={wrong ? "danger" : "muted"}>
                    {correct
                      ? exercise.explanation
                      : wrong
                        ? "That move is legal, but it does not give checkmate. Your position is ready for another try."
                        : hint
                          ? exercise.hint
                          : selected
                            ? `${selected} selected. Tap a highlighted square.`
                            : "Tap a white piece to see its legal moves."}
                  </Text>
                </Card>
              </View>
              <Button
                label={
                  correct
                    ? index === exercises.length - 1
                      ? "Finish practice"
                      : "Next position"
                    : "Find the move on the board"
                }
                disabled={!correct}
                onPress={() =>
                  index === exercises.length - 1
                    ? setDone(true)
                    : reset(index + 1)
                }
              />
            </>
          )}
          <Text tone="muted" style={[styles.small, { textAlign: "center" }]}>
            Sample positions · Your review progress is unchanged
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, padding: 20, alignItems: "center" },
  column: { width: "100%", maxWidth: 440, gap: 16 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  theme: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  small: { fontSize: 12, lineHeight: 18 },
  grow: { flex: 1 },
  title: { fontSize: 29, lineHeight: 36 },
  finished: { gap: 24, paddingVertical: 32, alignItems: "stretch" },
});
