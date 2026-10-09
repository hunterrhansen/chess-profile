import { router, useLocalSearchParams } from "expo-router";
import { Placeholder } from "@/components/page";
import { Button } from "@/components/ui";
export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Placeholder
      title="Game review"
      description="Key moments, engine explanations, and variations are coming next. Explore the planned review journey below."
      backTo="/games"
    >
      <Button
        label="All moves"
        variant="secondary"
        onPress={() => router.navigate(`/games/${id}/moves`)}
      />
      <Button
        label="Preview review completion"
        variant="secondary"
        onPress={() => router.navigate(`/games/${id}/done`)}
      />
    </Placeholder>
  );
}
