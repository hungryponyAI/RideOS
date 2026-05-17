import { useState, useCallback } from "react";
import { useOptionalProfileContext } from "../profiles/useProfileContext";

const KEY = "oudena_onboarding_done";

export type OnboardingStep = "welcome" | "trainer" | "strava" | "route";

const STEPS: OnboardingStep[] = ["welcome", "trainer", "strava", "route"];

function storageKey(profileId?: string | null): string {
  return profileId ? `${KEY}:${profileId}` : KEY;
}

export function useOnboarding(profileId?: string | null) {
  const profileContext = useOptionalProfileContext();
  const resolvedProfileId = profileId ?? profileContext?.activeProfile?.id ?? null;
  const key = storageKey(resolvedProfileId);

  const [state, setState] = useState(() => ({
    done: localStorage.getItem(key) === "1",
    idx: 0,
  }));

  const advance = useCallback(() => {
    setState(s => {
      const next = s.idx + 1;
      if (next >= STEPS.length) {
        localStorage.setItem(key, "1");
        return { ...s, done: true };
      }
      return { ...s, idx: next };
    });
  }, [key]);

  const complete = useCallback(() => {
    localStorage.setItem(key, "1");
    setState(s => ({ ...s, done: true }));
  }, [key]);

  const reopen = useCallback(() => {
    localStorage.removeItem(key);
    setState({ done: false, idx: 0 });
  }, [key]);

  return {
    done: state.done,
    step: STEPS[state.idx],
    stepIndex: state.idx,
    totalSteps: STEPS.length,
    advance,
    complete,
    reopen,
  };
}
