import { requireAccount } from "@/app/_lib/require-account";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { PrebuiltRoutineList } from "@/features/routines/components/prebuilt-routine-list";
import { RoutineList } from "@/features/routines/components/routine-list";
import { SegmentedLinks } from "@/components/ui/segmented-links";
import type { RoutineListItem } from "@/lib/types/routines";
import { listRoutinesFor, type RoutineSummary } from "@/server/services/routines";

/**
 * Two things live behind one tab: the routines somebody keeps, and the
 * programmes shipped with the app for them to copy.
 *
 * The choice is `?tab=`, not state, so it is a server render either way — the
 * back button undoes a switch and a link can point at either half. Anything
 * else in the parameter falls back to the user's own routines rather than
 * erroring, as on /progress: a hand-edited query string is a wrong guess.
 */
const TABS = [
  { value: "mine", label: "My routines" },
  { value: "prebuilt", label: "Prebuilt" },
] as const;

type RoutineTab = (typeof TABS)[number]["value"];

export default async function RoutinesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { userId } = await requireAccount();
  const { tab: requested } = await searchParams;
  const tab: RoutineTab = requested === "prebuilt" ? "prebuilt" : "mine";

  /** Only the half being shown is fetched; the prebuilt half needs no query. */
  const routines = tab === "mine" ? await listRoutinesFor(userId) : [];

  return (
    <Screen>
      <ScreenHeader eyebrow="Plans" title="Routines" />

      <SegmentedLinks
        basePath="/routines"
        options={TABS}
        value={tab}
        param="tab"
        query={{}}
        label="Which routines"
        className="mb-8"
      />

      {tab === "prebuilt" ? (
        <PrebuiltRoutineList />
      ) : (
        <RoutineList initialData={routines.map(toWireRoutine)} />
      )}
    </Screen>
  );
}

function toWireRoutine(routine: RoutineSummary): RoutineListItem {
  return {
    ...routine,
    createdAt: routine.createdAt.toISOString(),
    updatedAt: routine.updatedAt.toISOString(),
  };
}
