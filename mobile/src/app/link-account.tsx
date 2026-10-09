import { router } from "expo-router";
import { Placeholder } from "@/components/page";
import { Button } from "@/components/ui";
export default function Screen() {
  return (
    <Placeholder
      title="Link account"
      description="Source selection, handle lookup, and account confirmation will live here. No account is linked by this preview."
      backTo="/welcome"
    >
      <Button
        label="Preview import progress"
        variant="secondary"
        onPress={() => router.navigate("/import-progress")}
      />
    </Placeholder>
  );
}
