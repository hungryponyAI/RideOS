import { useCallback, useState, type ReactNode } from "react";
import { ScreenTransition } from "../../shared/motion/ScreenTransition";
import { ProfileSelectionScreen } from "../profiles/ProfileSelectionScreen";
import { useProfileContext } from "../profiles/useProfileContext";
import { StartupIntro } from "./StartupIntro";

type EntryStage = "intro" | "profiles" | "app";

export function AppEntryGate({
  children,
}: {
  children: (onSwitchProfile: () => void) => ReactNode;
}) {
  const { activeProfile, clearActiveProfile, profiles } = useProfileContext();
  const hasExistingProfiles = profiles.length > 0;
  const [stage, setStage] = useState<EntryStage>("intro");

  const handleSwitchProfile = useCallback(() => {
    clearActiveProfile();
    setStage("profiles");
  }, [clearActiveProfile]);

  if (stage === "intro") {
    return (
      <StartupIntro
        showWelcomeText={!hasExistingProfiles}
        onComplete={() => setStage(hasExistingProfiles ? "app" : "profiles")}
      />
    );
  }

  if (stage === "profiles" || activeProfile === null) {
    return (
      <ScreenTransition transitionKey="profiles">
        <ProfileSelectionScreen onProfileSelected={() => setStage("app")} />
      </ScreenTransition>
    );
  }

  return (
    <ScreenTransition transitionKey={`app-${activeProfile.id}`}>
      {children(handleSwitchProfile)}
    </ScreenTransition>
  );
}
