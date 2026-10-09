import { ScrollView, StyleSheet, View, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router, type Href } from "expo-router";
import { useTheme } from "@/lib/theme";
import { Text, Button, Card } from "@/components/ui";
export function Page({
  title,
  children,
  backTo,
}: ViewProps & { title: string; backTo?: Href }) {
  const { colors, isDark } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          {backTo && (
            <Button
              label="Back"
              variant="secondary"
              onPress={() =>
                router.canGoBack() ? router.back() : router.replace(backTo)
              }
            />
          )}
          <Text heading accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
export function Placeholder({
  title,
  description,
  backTo,
  children,
}: ViewProps & { title: string; description: string; backTo?: Href }) {
  return (
    <Page title={title} backTo={backTo}>
      <Card>
        <Text heading>Coming next</Text>
        <Text tone="muted">{description}</Text>
      </Card>
      {children}
    </Page>
  );
}
const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 100,
    alignItems: "center",
  },
  column: { width: "100%", maxWidth: 600, gap: 20 },
  title: { fontSize: 30, lineHeight: 38 },
});
