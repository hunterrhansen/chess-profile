import { router } from "expo-router";
import { Placeholder } from "@/components/page";
import { Button } from "@/components/ui";
export default function Screen() {
  return (
    <Placeholder
      title="Review complete"
      description="This is a preview of the completion screen. No review marks have been saved."
      backTo="/games"
    >
      <Button
        label="Practise positions"
        variant="secondary"
        onPress={() => router.navigate("/practice")}
      />
      <Button
        label="Back to Games"
        variant="secondary"
        onPress={() => router.dismissTo("/games")}
      />
    </Placeholder>
  );
}
