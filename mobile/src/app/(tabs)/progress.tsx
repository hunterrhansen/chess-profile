import { router } from "expo-router";
import { Placeholder } from "@/components/page";
import { Button } from "@/components/ui";
export default function Progress() {
  return (
    <Placeholder
      title="Progress"
      description="Your rating, learning units, and recurring tactics will live here."
    >
      <Button label="Try puzzles" onPress={() => router.push("/puzzles")} />
      <Button
        label="Your games"
        variant="secondary"
        onPress={() => router.navigate("/games")}
      />
    </Placeholder>
  );
}
