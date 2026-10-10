import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";
import { Board } from "@/components/board";
import { BoardSizeContext } from "@/components/board-size";
import { MoveClassification } from "@/components/move-classification";
import { Text, Button, Card } from "@/components/ui";
import { useSession } from "@/lib/session";
import type { Api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { replayGame, replayIndex, sampleGame, type GameDetail } from "@/lib/game-replay";

function exit() {
  router.dismissTo("/games");
}

export default function GameReplay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { connected, api, practiceScope } = useSession();
  if (!connected) {
    if (id === "preview") return <ReplayView game={sampleGame} sample />;
    return (
      <Frame>
        <View style={{ padding: 16, gap: 16 }}>
          <Text heading>Connect your account</Text>
          <Text tone="muted">Your imported games need a configured Knightly server. Open the sample replay from Games to try the board.</Text>
        </View>
      </Frame>
    );
  }
  return <GameReplayLoader key={`${practiceScope}/${id}`} id={id} api={api} />;
}

export function GameReplayLoader({ id, api }: { id: string; api: Api }) {
  const validId = /^[1-9]\d*$/.test(id ?? "");
  const [game, setGame] = useState<GameDetail>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!validId) return;
    const abort = new AbortController();
    api<GameDetail>(`/api/games/${id}`, undefined, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setGame(value);
      })
      .catch((err) => {
        if (!abort.signal.aborted)
          setError(err instanceof Error ? err.message : "Couldn’t load this game.");
      });
    return () => abort.abort();
  }, [api, validId, id, attempt]);
  if (game) return <ReplayView game={game} />;
  return (
    <Frame>
      <View style={{ padding: 16, flex: 1, justifyContent: "center", gap: 16 }}>
        <Text heading>
          {!validId || error ? "Couldn’t open this game" : "Loading your game…"}
        </Text>
        {!validId ? (
          <Text tone="danger" accessibilityRole="alert">This game link is invalid. Open a game from Games.</Text>
        ) : error ? (
          <>
            <Text tone="danger" selectable accessibilityRole="alert">{error}</Text>
            <Button label="Try again" onPress={() => {
              setError(undefined);
              setAttempt((n) => n + 1);
            }} />
          </>
        ) : null}
      </View>
    </Frame>
  );
}

function Frame({ children, flip }: { children: ReactNode; flip?: () => void }) {
  const { colors, isDark } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={{ width: "100%", maxWidth: 640, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 12, padding: 16 }}>
        <Button label="Games" accessibilityLabel="Back to Games" variant="secondary" onPress={exit} />
        <Text heading accessibilityRole="header" style={{ flex: 1, fontSize: 22 }}>All moves</Text>
        {flip && <Button label="Flip" accessibilityLabel="Flip board" variant="secondary" onPress={flip} />}
      </View>
      {children}
    </SafeAreaView>
  );
}

function ReplayView({ game, sample = false }: { game: GameDetail; sample?: boolean }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [ply, setPly] = useState(0);
  const [flipped, setFlipped] = useState(game.color === "black");
  const strip = useRef<ScrollView>(null);
  const offsets = useRef(new Map<number, number>());
  const result = useMemo(() => {
    try {
      return { replay: replayGame(game), error: null };
    } catch (err) {
      return { replay: null, error: err instanceof Error ? err.message : "Couldn’t read the game moves." };
    }
  }, [game]);
  useEffect(() => {
    const x = offsets.current.get(ply);
    if (x !== undefined) strip.current?.scrollTo({ x: Math.max(0, x - 32), animated: false });
  }, [ply]);
  if (!result.replay)
    return (
      <Frame>
        <View style={{ padding: 16 }}>
          <Text tone="danger" selectable accessibilityRole="alert">{result.error}</Text>
        </View>
      </Frame>
    );
  const { positions, moves, error } = result.replay;
  const index = replayIndex(ply, moves.length);
  const position = positions[index];
  const move = moves[index - 1];
  const analysis = game.plies.find((row) => row.ply === index && row.san === move?.san);
  const top = flipped ? game.white : game.black;
  const bottom = flipped ? game.black : game.white;
  return (
    <Frame flip={() => setFlipped((value) => !value)}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20, alignItems: "center", gap: 12 }}>
        <View style={{ width: "100%", gap: 12 }}>
          <Text selectable tone="muted" style={{ textAlign: "center" }}>
            {sample ? "Sample game · " : ""}{game.opening ?? "Opening unclassified"}
          </Text>
          <View style={{ width: "100%", gap: 8 }}>
            <Text selectable style={{ fontWeight: "800" }}>{top}</Text>
            <BoardSizeContext.Provider value={width}>
              <Board fen={position.fen} selected={null} targets={[]} flipped={flipped}
                disabled edgeInset={16} ledge={false} onSquare={() => {}} lastMove={position.lastMove ?? undefined} />
            </BoardSizeContext.Provider>
            <Text selectable style={{ fontWeight: "800" }}>{bottom}</Text>
          </View>
          <Card>
            <Text heading accessibilityLiveRegion="polite">{move?.label ?? "Starting position"}</Text>
            <Text tone="muted">{index} of {moves.length} half-moves</Text>
            {analysis?.classification && <MoveClassification kind={analysis.classification} />}
            {analysis?.best_san && analysis.best_san !== move?.san && (
              <Text tone="muted">Best move: {analysis.best_san}</Text>
            )}
            {error && <Text selectable tone="danger" accessibilityRole="alert">{error}</Text>}
            {moves.length === 0 && !error && <Text tone="muted">This game has no recorded moves.</Text>}
          </Card>
          <ScrollView ref={strip} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }} accessibilityLabel="Game moves">
            <MoveChip label="Start" active={index === 0} onPress={() => setPly(0)} onLayout={(x) => offsets.current.set(0, x)} />
            {moves.map((item) => (
              <MoveChip key={item.ply} label={item.label} active={index === item.ply}
                onPress={() => setPly(item.ply)} onLayout={(x) => offsets.current.set(item.ply, x)} />
            ))}
          </ScrollView>
          <Text tone="muted" style={{ fontSize: 13, textAlign: "center" }}>
            {sample ? "Sample replay. " : !game.analysed ? "Awaiting analysis. " : ""}
            Read-only replay. Guided lessons are coming next; replay doesn’t mark this game reviewed.
          </Text>
        </View>
      </ScrollView>
      <View style={{ width: "100%", maxWidth: 640, alignSelf: "center", padding: 16, borderTopWidth: 2, borderColor: colors.line, flexDirection: "row", gap: 8 }}>
        {[
          { label: "|‹", name: "First position", target: 0, disabled: index === 0 },
          { label: "‹", name: "Previous move", target: index - 1, disabled: index === 0 },
          { label: "›", name: "Next move", target: index + 1, disabled: index === moves.length },
          { label: "›|", name: "Last position", target: moves.length, disabled: index === moves.length },
        ].map((control) => (
          <View key={control.name} style={{ flex: 1 }}>
            <Button label={control.label} accessibilityLabel={control.name} variant="secondary"
              disabled={control.disabled} onPress={() => setPly(replayIndex(control.target, moves.length))} />
          </View>
        ))}
      </View>
    </Frame>
  );
}

function MoveChip({ label, active, onPress, onLayout }: { label: string; active: boolean; onPress: () => void; onLayout: (x: number) => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} onLayout={(event) => onLayout(event.nativeEvent.layout.x)}
      accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }}
      style={({ pressed }) => ({ minHeight: 48, justifyContent: "center", paddingHorizontal: 12, borderRadius: 12,
        backgroundColor: active ? colors.sky : colors.surface, borderColor: active ? colors.skyLip : colors.line,
        borderWidth: 2, opacity: pressed ? 0.8 : 1 })}>
      <Text style={{ color: active ? colors.onSky : colors.ink, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}
