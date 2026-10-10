import { Picker } from "@expo/ui";
import type { Promotion } from "@/lib/practice-flow";
export type PromotionPickerProps = {
  choice: Promotion;
  onChange: (value: Promotion) => void;
  options: { value: Promotion; label: string }[];
};
export function PromotionPicker({
  choice,
  onChange,
  options,
}: PromotionPickerProps) {
  return (
    <Picker
      selectedValue={choice}
      onValueChange={onChange}
      testID="promotion-piece"
    >
      {options.map(({ value, label }) => (
        <Picker.Item key={value} value={value} label={label} />
      ))}
    </Picker>
  );
}
