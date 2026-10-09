import * as Dialog from "@rn-primitives/dialog";
import { StyleSheet, View, Pressable, ScrollView } from "react-native";
import { fonts, useTheme } from "../lib/theme";
import { Button, Text } from "./ui";
export function HelpDialog() {
  const { colors: c } = useTheme();
  // Radix on web merges styles as CSS objects; flatten RN arrays at this boundary.
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Pressable
          accessibilityLabel="How to practice"
          style={StyleSheet.flatten([
            styles.trigger,
            { borderColor: c.line, backgroundColor: c.surface },
          ])}
        >
          <Text style={{ fontFamily: fonts.bold }}>?</Text>
        </Pressable>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          style={StyleSheet.flatten([
            styles.overlay,
            { backgroundColor: c.scrim },
          ])}
        >
          <Dialog.Content
            style={StyleSheet.flatten([
              styles.content,
              { backgroundColor: c.surface, borderColor: c.line },
            ])}
          >
            <ScrollView contentContainerStyle={{ gap: 12 }}>
              <Dialog.Title
                style={StyleSheet.flatten([styles.title, { color: c.ink }])}
              >
                Make your move
              </Dialog.Title>
              <Dialog.Description
                style={StyleSheet.flatten([
                  styles.description,
                  { color: c.inkMuted },
                ])}
              >
                Tap a piece of the side to move, then a highlighted square. Find
                the strongest move. Hint helps you see the idea; Flip lets you
                inspect the other side.
              </Dialog.Description>
              <View style={{ marginTop: 12 }}>
                <Dialog.Close asChild>
                  <Button label="Got it" />
                </Dialog.Close>
              </View>
            </ScrollView>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
const styles = StyleSheet.create({
  trigger: {
    width: 44,
    height: 44,
    borderWidth: 2,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  content: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "90%",
    padding: 24,
    gap: 12,
    borderRadius: 24,
    borderWidth: 2,
  },
  title: { fontFamily: fonts.heading, fontSize: 25, lineHeight: 32 },
  description: { fontFamily: fonts.body, fontSize: 16, lineHeight: 25 },
});
