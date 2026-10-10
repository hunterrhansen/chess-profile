import { Picker, Text } from "@expo/ui/swift-ui";
import { pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import type { PromotionPickerProps } from "./promotion-picker";
export function PromotionPicker({
  choice,
  onChange,
  options,
}: PromotionPickerProps) {
  return (
    <Picker
      selection={choice}
      onSelectionChange={onChange}
      modifiers={[pickerStyle("segmented")]}
      testID="promotion-piece"
    >
      {options.map(({ value, label }) => (
        <Text key={value} modifiers={[tag(value)]}>
          {label}
        </Text>
      ))}
    </Picker>
  );
}
