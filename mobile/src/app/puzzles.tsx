import { router } from "expo-router";
import { Placeholder } from "@/components/page";
import { Button } from "@/components/ui";
export default function Screen() {
  return (
    <Placeholder
      title="Puzzles"
      description="Practise tactics from your recurring patterns. Puzzle sessions are coming next."
      backTo="/"
    >
      <Button
        label="Back to Progress"
        variant="secondary"
        onPress={() => router.navigate("/progress")}
      />
    </Placeholder>
  );
}
