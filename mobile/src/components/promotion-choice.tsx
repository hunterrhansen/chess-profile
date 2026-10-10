import { useEffect, useRef } from "react";
import { AccessibilityInfo, BackHandler, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { Color, Square } from "chess.js";
import { useTheme } from "@/lib/theme";
import type { Promotion } from "@/lib/practice-flow";
import { promotionLayout } from "@/lib/promotion-layout";
import { Piece } from "./piece";
import { Text } from "./ui";
const names: Record<Promotion, string> = { q: "Queen", r: "Rook", b: "Bishop", n: "Knight" };
export type PromotionRequest = {
  from: Square;
  to: Square;
  choices: Promotion[];
  onChoose: (kind: Promotion) => void;
  onCancel: () => void;
};

/** Board-anchored one-tap choice; the pending pawn is never submitted on cancel. */
export function PromotionChoice({ request, side, flipped, size }: {
  request: PromotionRequest; side: Color; flipped: boolean; size: number;
}) {
  const { colors: c } = useTheme();
  const onCancel = request.onCancel;
  const layout = promotionLayout(request.to, flipped, size, request.choices);
  const first = useRef<View>(null);
  const scroll = useRef<ScrollView>(null);
  const buttons = useRef<(View | null)[]>([]);
  useEffect(() => {
    if (Platform.OS === "web") {
      const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      first.current?.focus();
      return () => previous?.focus();
    }
    else AccessibilityInfo.announceForAccessibility("Choose promotion piece. Queen, knight, rook, or bishop.");
  }, []);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onCancel();
      return true;
    });
    return () => subscription.remove();
  }, [onCancel]);
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]} accessibilityViewIsModal
      role="dialog" accessibilityLabel="Choose promotion piece"
      onAccessibilityEscape={request.onCancel}
      {...(Platform.OS === "web" ? { onKeyDown: (event: { key: string; shiftKey?: boolean; target?: unknown; preventDefault: () => void }) => {
        if (event.key === "Escape") { event.preventDefault(); request.onCancel(); }
        if (event.key === "Tab") {
          event.preventDefault();
          const index = buttons.current.findIndex(button => button === event.target);
          const count = layout.choices.length + 1;
          buttons.current[(index + (event.shiftKey ? -1 : 1) + count) % count]?.focus();
        }
      } } : {})}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Dismiss promotion picker"
        accessibilityRole="button" onPress={request.onCancel} />
      <View style={{ position: "absolute", left: layout.left, top: layout.top,
        width: layout.targetSize, height: layout.height,
        backgroundColor: c.surface }}>
        <ScrollView ref={scroll} bounces={false}
          scrollEnabled={layout.contentHeight > layout.height}
          onContentSizeChange={() => { if (layout.fromBottom) scroll.current?.scrollToEnd({ animated: false }); }}
          contentContainerStyle={{ flexDirection: layout.fromBottom ? "column-reverse" : "column" }}>
        {layout.choices.map((kind, index) => (
          <Pressable key={kind} ref={view => { buttons.current[index] = view; if (index === 0) first.current = view; }}
            accessibilityRole="button" accessibilityLabel={`Promote to ${names[kind]}`}
            onPress={() => request.onChoose(kind)}
            style={({ pressed }) => ({ width: "100%", height: layout.targetSize,
              backgroundColor: pressed ? c.surfaceMuted : c.surface })}>
            <Piece kind={kind} side={side} />
          </Pressable>
        ))}
        <Pressable ref={view => { buttons.current[layout.choices.length] = view; }} accessibilityRole="button" accessibilityLabel="Cancel promotion"
          onPress={request.onCancel}
          style={({ pressed }) => ({ height: layout.cancelSize, alignItems: "center",
            justifyContent: "center", backgroundColor: pressed ? c.surfaceMuted : c.surface })}>
          <Text allowFontScaling={false} style={{ fontSize: 26, color: c.inkMuted }}>×</Text>
        </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}
