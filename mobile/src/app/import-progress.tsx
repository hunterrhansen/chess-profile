import { router } from "expo-router";
import { Placeholder } from "@/components/page";
import { Button } from "@/components/ui";
export default function Screen() {
  return (
    <Placeholder
      title="Import progress"
      description="Import and analysis progress will appear here. This preview does not start an import."
      backTo="/link-account"
    >
      <Button
        label="Return to Home"
        variant="secondary"
        onPress={() => router.navigate("/")}
      />
      <Button
        label="Your games"
        variant="secondary"
        onPress={() => router.navigate("/games")}
      />
    </Placeholder>
  );
}
