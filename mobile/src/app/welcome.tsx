import { router } from "expo-router";
import { Placeholder } from "@/components/page";
import { Button } from "@/components/ui";
export default function Screen() {
  return (
    <Placeholder
      title="Welcome"
      description="Connect your Chess.com or Lichess account to turn your games into lessons. This is a preview of the setup flow."
      backTo="/settings"
    >
      <Button
        label="Preview account linking"
        variant="secondary"
        onPress={() => router.navigate("/link-account")}
      />
    </Placeholder>
  );
}
