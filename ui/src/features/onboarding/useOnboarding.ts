import { useState, useCallback } from "react";

const KEY = "oudena_onboarding_done";

export type OnboardingStep = "welcome" | "trainer" | "strava" | "route";

const STEPS: OnboardingStep[] = ["welcome", "trainer", "strava", "route"];

export function useOnboarding() {
  const [state, setState] = useState(() => ({
    done: localStorage.getItem(KEY) === "1",
    idx: 0,
  }));

  const advance = useCallback(() => {
    setState(s => {
      const next = s.idx + 1;
      if (next >= STEPS.length) {
        localStorage.setItem(KEY, "1");
        return { ...s, done: true };
      }
      return { ...s, idx: next };
    });
  }, []);

  const complete = useCallback(() => {
    localStorage.setItem(KEY, "1");
    setState(s => ({ ...s, done: true }));
  }, []);

  const reopen = useCallback(() => {
    localStorage.removeItem(KEY);
    setState({ done: false, idx: 0 });
  }, []);

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
