import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { Card, Text } from "@/components/ui";
import { fonts, useTheme } from "@/lib/theme";
import { completionSummary, revisitMoves, type CompletionResult } from "@/lib/practice-completion";
import { CompletionEntrance, CompletionConfetti, completionDelays } from "@/components/completion-motion";
import { BottomActions, BottomAction } from "@/components/bottom-actions";
import { CompletionCount } from "@/components/completion-count";

/** Web's completion page, with safe areas and overflow for compact phones/large text. */
export default function PracticeComplete({
  done, results, stats, onRestart,
}: {
  done: number;
  results: CompletionResult[];
  stats?: { mastered: number; learning: number; new: number };
  onRestart?: () => void;
}) {
  const { colors: c, isDark } = useTheme();
  const revisit = revisitMoves(results);
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: c.page }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll}>
        <View style={styles.content}>
          <View style={{ alignSelf: "center" }}>
            <CompletionConfetti />
            <CompletionEntrance medal style={[styles.medalBase, { backgroundColor: c.goldLip }]}>
              <View style={[styles.medal, { backgroundColor: c.gold }]}>
                <Svg width={48} height={48} viewBox="0 0 48 48" aria-hidden>
                  <Path d="M8 25l10 10L40 13" fill="none" stroke={c.onGold} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </View>
            </CompletionEntrance>
          </View>
          <CompletionEntrance delay={completionDelays.heading} style={styles.intro}>
            <Text heading accessibilityRole="header" style={styles.title}>
              {stats ? "Done for today" : "Sample complete"}
            </Text>
            <Text tone="muted" style={styles.summary}>{completionSummary(done, results)}</Text>
          </CompletionEntrance>
          {results.length > 0 && <CompletionEntrance delay={completionDelays.results}><Card style={{ gap: 8 }}>
            <Text tone="muted" style={styles.label}>Today, one by one</Text>
            <View style={styles.marks}>
              {results.map((result, index) => <View
                key={index}
                accessible
                accessibilityRole="image"
                accessibilityLabel={`Position ${index + 1}: ${result.mark === "helped" ? "with help" : result.mark === "good" ? "found" : result.mark}`}
                style={[styles.mark, { backgroundColor: result.mark === "found" || result.mark === "good" ? c.brand : result.mark === "helped" ? c.sky : c.danger }]}
              />)}
            </View>
            {!!revisit && <Text tone="muted" style={styles.revisit}>To go over again: {revisit}.</Text>}
          </Card></CompletionEntrance>}
          {stats ? <>
            <View style={styles.stats}>
              {([
                ["Mastered", stats.mastered],
                ["Learning", stats.learning],
                ["Not seen yet", stats.new],
              ] as const).map(([label, value], order) => <CompletionEntrance key={label} delay={completionDelays.stat(order)} style={{ flex: 1 }}>
                <Card containerStyle={{ flex: 1 }} style={styles.stat}>
                  <Text tone="muted" style={styles.label}>{label}</Text>
                  <CompletionCount value={value} delay={completionDelays.stat(order)} style={styles.value} />
                </Card>
              </CompletionEntrance>)}
            </View>
            <Text tone="muted" style={styles.note}>Mastered: you&apos;re expected to still know it two months from now. It still comes back, just rarely.</Text>
          </> : <Text tone="muted" style={styles.note}>Sample positions · Your review progress is unchanged.</Text>}

        </View>
      </ScrollView>
      <BottomActions
        secondary={stats
          ? <BottomAction quiet label="See your deck" onPress={() => router.dismissTo("/progress")} />
          : onRestart && <BottomAction quiet label="Practice again" onPress={onRestart} />}
        primary={<BottomAction label="Back home" onPress={() => router.dismissTo("/")} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 24, paddingBottom: 24 },
  content: { width: "100%", maxWidth: 560, alignSelf: "center", gap: 24 },
  medalBase: { width: 96, height: 100, borderRadius: 48, alignSelf: "center", marginBottom: 0 },
  medal: { width: 96, height: 94, borderRadius: 48, alignItems: "center", justifyContent: "center" },
  intro: { gap: 8, alignItems: "center" },
  title: { fontSize: 34, lineHeight: 41, textAlign: "center" },
  summary: { textAlign: "center", fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 17, letterSpacing: 0.6, textTransform: "uppercase" },
  marks: { flexDirection: "row", gap: 6 },
  mark: { flex: 1, height: 14, borderRadius: 7 },
  revisit: { fontSize: 14, lineHeight: 20 },
  stats: { flexDirection: "row", gap: 16, alignItems: "stretch" },
  stat: { minHeight: 108, flex: 1, padding: 16, gap: 8 },
  value: { fontSize: 30, lineHeight: 36, fontVariant: ["tabular-nums"] },
  note: { textAlign: "center", fontSize: 14, lineHeight: 20, marginTop: -8 },
});
