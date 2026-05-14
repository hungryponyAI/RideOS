import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useOnboarding } from "../features/onboarding/useOnboarding";
import { OnboardingFlow } from "../features/onboarding/OnboardingFlow";
import { renderHook, act } from "@testing-library/react";

vi.mock("../shared/ws/useWS", () => ({
  useWS: () => ({ sendMessage: vi.fn(), status: "connected" }),
}));

vi.mock("../shared/ws/useWSSubscription", () => ({
  useWSSubscription: vi.fn(),
}));

vi.mock("../features/settings/hooks/useDeviceStatus", () => ({
  useDeviceStatus: () => ({ kickrConnected: false, clickConnected: false }),
}));

vi.mock("../features/strava/hooks/useStravaStatus", () => ({
  useStravaStatus: () => ({
    stravaStatus: null,
    stravaAuthUrl: null,
    stravaError: null,
    clearStravaAuthUrl: vi.fn(),
    clearStravaError: vi.fn(),
  }),
}));

vi.mock("../features/routes/hooks/useRouteLibrary", () => ({
  useRouteLibrary: () => [],
}));

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

beforeEach(() => {
  localStorageMock.clear();
});

describe("useOnboarding", () => {
  it("shows onboarding when localStorage flag is absent", () => {
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.done).toBe(false);
    expect(result.current.step).toBe("welcome");
  });

  it("does not show onboarding when localStorage flag is present", () => {
    localStorageMock.setItem("oudena_onboarding_done", "1");
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.done).toBe(true);
  });

  it("advance moves through steps", () => {
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.step).toBe("welcome");
    act(() => result.current.advance());
    expect(result.current.step).toBe("trainer");
    act(() => result.current.advance());
    expect(result.current.step).toBe("strava");
    act(() => result.current.advance());
    expect(result.current.step).toBe("route");
  });

  it("complete stores flag and marks done", () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.complete());
    expect(result.current.done).toBe(true);
    expect(localStorageMock.getItem("oudena_onboarding_done")).toBe("1");
  });

  it("advance on last step stores flag and marks done", () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.advance()); // welcome → trainer
    act(() => result.current.advance()); // trainer → strava
    act(() => result.current.advance()); // strava → route
    act(() => result.current.advance()); // route → done
    expect(result.current.done).toBe(true);
    expect(localStorageMock.getItem("oudena_onboarding_done")).toBe("1");
  });

  it("reopen clears flag and resets step", () => {
    localStorageMock.setItem("oudena_onboarding_done", "1");
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.reopen());
    expect(result.current.done).toBe(false);
    expect(result.current.step).toBe("welcome");
    expect(localStorageMock.getItem("oudena_onboarding_done")).toBeNull();
  });
});

describe("OnboardingFlow", () => {
  const defaultProps = {
    step: "welcome" as const,
    stepIndex: 0,
    totalSteps: 4,
    onAdvance: vi.fn(),
    onComplete: vi.fn(),
  };

  it("renders welcome step content", () => {
    render(<OnboardingFlow {...defaultProps} />);
    expect(screen.getByText(/Willkommen bei OUDENA/i)).toBeTruthy();
  });

  it("renders trainer step with status", () => {
    render(<OnboardingFlow {...defaultProps} step="trainer" stepIndex={1} />);
    expect(screen.getByRole("heading", { name: /Trainer-Verbindung/i })).toBeTruthy();
    // With ws status "connected" and kickrConnected false, trainer shows searching state
    expect(screen.getByText(/Trainer wird gesucht/i)).toBeTruthy();
  });

  it("renders strava step", () => {
    render(<OnboardingFlow {...defaultProps} step="strava" stepIndex={2} />);
    expect(screen.getByRole("heading", { name: /Strava verbinden/i })).toBeTruthy();
  });

  it("renders route step with zero routes", () => {
    render(<OnboardingFlow {...defaultProps} step="route" stepIndex={3} />);
    expect(screen.getByText(/Strecken importieren/i)).toBeTruthy();
  });

  it("calls onAdvance when Weiter is clicked", () => {
    const onAdvance = vi.fn();
    render(<OnboardingFlow {...defaultProps} onAdvance={onAdvance} />);
    fireEvent.click(screen.getByRole("button", { name: /Weiter/i }));
    expect(onAdvance).toHaveBeenCalledOnce();
  });

  it("calls onComplete when Los gehts is clicked on last step", () => {
    const onComplete = vi.fn();
    render(<OnboardingFlow {...defaultProps} step="route" stepIndex={3} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /Los gehts/i }));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
