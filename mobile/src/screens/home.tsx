import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { type Home as HomeData } from "@/lib/home";
import { unitCopy } from "@/lib/units";
import { Text, Button, Card, Progress } from "@/components/ui";
import { KnIcon, type Glyph } from "@/components/kn-icon";
import { usePhoneGoal } from "@/components/app-shell";
import { LoadingScreen } from "@/components/knight-loader";
// Explicit design preview; never a fallback for failed account requests.
const example: HomeData = {
  units: [
    {
      id: "blunders",
      title: "Stop hanging pieces",
      kpi: "blunders_per_game",
      value: 2.3,
      target: 1.5,
      lower_better: true,
      done: false,
      check: { size: 10, games: 10, hits: 3, value: 2.3 },
    },
  ],
  today: {
    game: null,
    new_games: 0,
    reviewed_today: 1,
    positions: { done: 0, total: 3 },
    deck_total: 3,
    puzzles: {
      theme: "hangingPiece",
      share: 0.43,
      done: 0,
      session: 5,
      available: true,
    },
  },
};
type Step = {
  key: string;
  glyph: Glyph;
  label: string;
  done: boolean;
  tag?: string;
  href: Href;
  eyebrow: string;
  body: string;
  cta: string;
  quiet?: boolean;
};
const tacticLabels: Record<string, string> = {
  hangingPiece: "Loose pieces",
  fork: "Forks",
  pin: "Pins",
  skewer: "Skewers",
  discoveredAttack: "Discovered attacks",
  backRankMate: "Back rank",
  mate: "Mates",
};
export default function Home() {
  const { connected, api } = useSession();
  const { colors: c } = useTheme();
  const { setGoal } = usePhoneGoal();
  const { width } = useWindowDimensions();
  const [data, setData] = useState<HomeData | undefined>(
    connected ? undefined : example,
  );
  const [error, setError] = useState<string>();
  const requestRef = useRef<AbortController | null>(null);
  const [expanded, setExpanded] = useState(true);
  const reload = useCallback(() => {
    if (!connected) return;
    requestRef.current?.abort();
    const abort = new AbortController();
    requestRef.current = abort;
    setError(undefined);
    setGoal({ status: "loading" });
    api<HomeData>("/api/home", undefined, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setData(value);
      })
      .catch((err) => {
        if (!abort.signal.aborted) setError(err.message);
      });
    return () => requestRef.current?.abort();
  }, [api, connected, setGoal]);
  useFocusEffect(reload);
  useEffect(() => {
    if (error) setGoal({ status: "error" });
    else if (data)
      setGoal({
        status: "ready",
        reviewed: data.today.reviewed_today,
        done: data.today.positions.done,
        total: data.today.positions.total,
        game: data.today.game?.id,
      });
    else setGoal({ status: "loading" });
  }, [data, error, connected, setGoal]);
  if (error)
    return (
      <View style={{ padding: 24, gap: 16 }}>
        <Text heading>Couldn’t load your path</Text>
        <Text tone="danger" accessibilityRole="alert">
          {error}
        </Text>
        <Button label="Try again" onPress={() => reload()} />
      </View>
    );
  if (!data)
    return <LoadingScreen title="Laying out your path…" detail="Finding your next step." />;
  const lead = data.units[0];
  const copy = lead ? unitCopy(lead) : null;
  const { game, positions, reviewed_today, deck_total, puzzles } = data.today;
  const left = Math.max(0, positions.total - positions.done);
  const goalDone = (!game || reviewed_today > 0) && left === 0;
  const steps: Step[] = [];
  if (game)
    steps.push({
      key: "review",
      glyph: "review",
      label: "Review your newest game",
      tag: "New game",
      done: false,
      href: `/games/${game.id}`,
      eyebrow: `VS ${game.opponent ?? "OPPONENT"} · ${game.time_control ?? "YOUR GAME"}`,
      body: `You ${game.outcome === "win" ? "won" : game.outcome === "loss" ? "lost" : "drew"}${game.blunders ? ` with ${game.blunders} blunders` : ""}. Walk through the key moments; afterwards your mistakes join your review deck.`,
      cta: "Start review",
    });
  else if (reviewed_today > 0)
    steps.push({
      key: "review",
      glyph: "review",
      label: connected ? "Reviewed today's game" : "Your first game review",
      done: true,
      href: "/games",
      eyebrow: "",
      body: "",
      cta: "",
    });
  if (deck_total > 0 && positions.total > 0)
    steps.push({
      key: "positions",
      glyph: "drill",
      label: connected ? "Today's positions" : "Try your first positions",
      tag: `${left} left`,
      done: left === 0,
      href: "/practice",
      eyebrow: connected
        ? `YOUR REVIEW DECK · ABOUT ${Math.max(1, Math.round((left * 40) / 60))} MINUTES`
        : "SAMPLE PRACTICE · 3 POSITIONS",
      body: connected
        ? `${left} positions from your own games are due. Found ones come back later and later; misses come back sooner.`
        : "Find a better move in three sample positions. Your progress stays unchanged.",
      cta: connected ? "Start practice" : "Start sample practice",
    });
  if (puzzles.available && puzzles.theme)
    steps.push({
      key: "puzzles",
      glyph: "drill",
      label: `Puzzles: ${(tacticLabels[puzzles.theme] ?? puzzles.theme).toLowerCase()}`,
      tag: `${Math.max(0, puzzles.session - puzzles.done)} to go`,
      done: puzzles.done >= puzzles.session,
      href: { pathname: "/puzzles", params: { theme: puzzles.theme } },
      eyebrow: "YOUR MOST COMMON TACTIC",
      body: "Train spotting the tactics you miss with puzzles near your level. Puzzle play is coming next.",
      cta: "Explore puzzles",
    });
  steps.push({
    key: "play",
    glyph: "play",
    label: "Play the bot with blunder check on",
    tag: goalDone ? "Bonus" : undefined,
    done: false,
    href: "/play",
    eyebrow: "OPTIONAL · PUT IT TO WORK",
    body: "Practise spotting the move that loses. Bot play and Blunder check are coming next.",
    cta: "Explore Play",
    quiet: true,
  });
  const current = steps.findIndex((s) => !s.done);
  const wide = process.env.EXPO_OS === "web" && width >= 1100;
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        padding: 16,
        paddingBottom: 32,
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: wide ? 960 : 560,
          flexDirection: wide ? "row" : "column",
          gap: 16,
        }}
      >
        <View style={{ flex: 1, gap: 16 }}>
          {lead && copy ? (
            <View
              style={{
                borderRadius: 24,
                backgroundColor: c.brandLip,
                paddingBottom: 4,
              }}
            >
              <View
                style={{
                  backgroundColor: c.brand,
                  borderRadius: 24,
                  padding: 16,
                  gap: 6,
                }}
              >
                <Text
                  style={{
                    color: c.onBrand,
                    fontSize: 12,
                    lineHeight: 16,
                    fontWeight: "800",
                    letterSpacing: 0.6,
                  }}
                >
                  {connected
                    ? "UNIT 1 · YOUR MAIN FOCUS"
                    : "UNIT 1 · DESIGN PREVIEW"}
                </Text>
                <Text
                  heading
                  accessibilityRole="header"
                  style={{ fontSize: 24, lineHeight: 28, color: c.onBrand }}
                >
                  {lead.title}
                </Text>
                <Text
                  style={{ color: c.onBrand, fontSize: 14, lineHeight: 20 }}
                >
                  {copy.goal}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 12,
                    alignItems: "center",
                    marginTop: 4,
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      height: 10,
                      backgroundColor: c.brandLip,
                      borderRadius: 8,
                      overflow: "hidden",
                    }}
                    accessible
                    accessibilityRole="progressbar"
                    accessibilityLabel="Unit check"
                    accessibilityValue={{
                      min: 0,
                      max: lead.check.size,
                      now: lead.check.hits,
                    }}
                  >
                    <View
                      style={{
                        height: 10,
                        backgroundColor: c.onBrand,
                        width: `${Math.min(100, (lead.check.hits / Math.max(1, lead.check.size)) * 100)}%`,
                      }}
                    />
                  </View>
                  <Text
                    style={{
                      fontSize: 12,
                      color: c.onBrand,
                      fontWeight: "800",
                    }}
                  >
                    {lead.check.hits} of {lead.check.size} games
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <Card>
              <Text heading>Your path starts here</Text>
              <Text tone="muted">
                Import your games to find your main focus.
              </Text>
              <Button
                label="Link a chess account"
                onPress={() => router.push("/welcome")}
              />
            </Card>
          )}
          {goalDone && (
            <Card style={{ backgroundColor: c.gold, borderColor: c.goldLip }}>
              <Text heading>Today’s goal done</Text>
              <Text>
                {positions.done} positions cleared. The next ones come due
                tomorrow.
              </Text>
            </Card>
          )}
          <View style={{ gap: 16, alignItems: "center" }}>
            {steps.map((step, i) => {
              const active = i === current;
              const locked = i > current && !step.done;
              return (
                <View
                  key={step.key}
                  style={{ width: "100%", alignItems: "center", gap: 8 }}
                >
                  {active && step.tag && (
                    <View
                      style={{
                        backgroundColor: c.sky,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color: c.onSky,
                          fontWeight: "800",
                        }}
                      >
                        {step.tag.toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View
                    style={{
                      padding: 4,
                      borderRadius: 60,
                      borderWidth: active ? 4 : 0,
                      borderColor: c.line,
                    }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${step.label}${step.done ? ", complete" : locked ? ", locked" : ""}`}
                      accessibilityState={{
                        disabled: locked,
                        expanded: active ? expanded : undefined,
                      }}
                      disabled={locked}
                      onPress={() =>
                        active ? setExpanded((v) => !v) : router.push(step.href)
                      }
                      style={({ pressed }) => ({
                        width: active ? 76 : 64,
                        height: active ? 76 : 64,
                        borderRadius: 40,
                        backgroundColor: locked ? c.surfaceMuted : c.brand,
                        borderBottomWidth: 6,
                        borderBottomColor: locked ? c.line : c.brandLip,
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: pressed ? 0.8 : 1,
                      })}
                    >
                      <KnIcon
                        glyph={
                          step.done ? "check" : locked ? "lock" : step.glyph
                        }
                        size={40}
                      />
                    </Pressable>
                  </View>
                  <Text
                    tone={locked ? "muted" : "default"}
                    style={{
                      textAlign: "center",
                      fontWeight: "800",
                      fontSize: 14,
                      lineHeight: 20,
                    }}
                  >
                    {step.label}
                  </Text>
                  {active && expanded && (
                    <Card
                      style={{
                        borderColor: c.brand,
                        width: "100%",
                        padding: 16,
                      }}
                    >
                      <Text
                        tone="muted"
                        style={{ fontSize: 13, fontWeight: "800" }}
                      >
                        {step.eyebrow}
                      </Text>
                      <Text
                        tone="muted"
                        style={{ fontSize: 14, lineHeight: 20 }}
                      >
                        {step.body}
                      </Text>
                      <Button
                        label={step.cta.toUpperCase()}
                        variant={step.quiet ? "secondary" : "brand"}
                        onPress={() => router.push(step.href)}
                      />
                    </Card>
                  )}
                </View>
              );
            })}
            {copy && (
              <View style={{ alignItems: "center", gap: 8 }}>
                <KnIcon glyph="crown" size={48} />
                <Text tone="muted" style={{ textAlign: "center" }}>
                  {copy.checkLabel}
                </Text>
              </View>
            )}
          </View>
          {data.units.slice(1).map((unit, i) => (
            <View
              key={unit.id}
              style={{
                gap: 12,
                alignItems: "center",
                borderTopWidth: 2,
                borderColor: c.line,
                paddingTop: 20,
              }}
            >
              <Text tone="muted" style={{ fontSize: 13, fontWeight: "800" }}>
                UNIT {i + 2} · {unit.title.toUpperCase()}
              </Text>
              <Text tone="muted" style={{ textAlign: "center" }}>
                {unitCopy(unit).note}
              </Text>
              <KnIcon glyph={unit.done ? "check" : "lock"} />
            </View>
          ))}
          <Text tone="muted" style={{ fontSize: 13, textAlign: "center" }}>
            Units re-sort as your numbers change: your weakest is always next.
          </Text>
        </View>
        {wide && (
          <View style={{ width: 280, gap: 16 }}>
            <Card>
              <Text heading>Today’s goal</Text>
              <Text>Game reviewed: {reviewed_today ? 1 : 0} of 1</Text>
              <Text>
                Positions: {positions.done} of {positions.total}
              </Text>
              <Progress value={positions.done} total={positions.total} />
              <Button
                label="Review positions"
                variant="secondary"
                onPress={() => router.push("/practice")}
              />
            </Card>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
