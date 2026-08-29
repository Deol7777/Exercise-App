import { requireAccount } from "@/app/_lib/require-account";
import { DeleteAccountDialog } from "@/components/account/delete-account-dialog";
import { ThemeSelect } from "@/components/account/theme-select";
import { WeightUnitSelect } from "@/components/account/weight-unit-select";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Screen, ScreenHeader, SectionHeader } from "@/components/layout/screen";
import { Surface } from "@/components/ui/surface";

/**
 * The account controls used to live on the home screen. The references give
 * home over entirely to training, and the tab bar is the five destinations they
 * show — so they moved here, reached from the gear in the home header.
 */
export default async function SettingsPage() {
  const { unit, theme, email } = await requireAccount();

  return (
    <Screen>
      <ScreenHeader eyebrow="Account" title="Settings" />

      <SectionHeader label="Display" />
      <Surface className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <span className="text-sm text-muted-foreground">Show weights in</span>
          <WeightUnitSelect unit={unit} />
        </div>
        <div className="flex flex-col gap-3">
          <span className="text-sm text-muted-foreground">Colour theme</span>
          <ThemeSelect theme={theme} />
        </div>
      </Surface>

      <SectionHeader label="Account" className="mt-8" />
      <Surface className="flex flex-col gap-4">
        {email ? (
          <div>
            <p className="label-caps">Signed in as</p>
            <p className="mt-1 text-sm font-medium break-all">{email}</p>
          </div>
        ) : null}
        <SignOutButton />
      </Surface>

      <SectionHeader label="Danger" className="mt-8" />
      <Surface>
        {email ? (
          <DeleteAccountDialog email={email} />
        ) : (
          <p className="text-sm text-muted-foreground">
            This account has no email address on it, so it cannot be deleted from here.
          </p>
        )}
      </Surface>
    </Screen>
  );
}
