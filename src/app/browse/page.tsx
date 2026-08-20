import { Screen, ScreenHeader } from "@/components/layout/screen";
import { Mascot } from "@/components/ui/mascot";
import { Surface } from "@/components/ui/surface";

/**
 * A placeholder so the Browse tab has somewhere to land. The real screen — the
 * search field, the muscle-group filter pills and the exercise rows in
 * references/image copy 3.png — is built when we reach it.
 */
export default function BrowsePage() {
  return (
    <Screen>
      <ScreenHeader eyebrow="Library" title="Exercises" />
      <Surface className="flex flex-col items-center gap-4 py-12 text-center">
        <Mascot name="sloth" size="lg" />
        <p className="text-sm text-muted-foreground text-balance">
          The catalog lives here. Nobody has built the shelves yet.
        </p>
      </Surface>
    </Screen>
  );
}
