import { router, useLocalSearchParams } from "expo-router";
import { Placeholder } from "@/components/page";
import { Button } from "@/components/ui";
export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Placeholder
      title="All moves"
      description="Board replay, the move list, and evaluation history will live here."
      backTo="/games"
    >
      <Button
        label="Back to review"
        variant="secondary"
        onPress={() => router.navigate(`/games/${id}`)}
      />
    </Placeholder>
  );
}
