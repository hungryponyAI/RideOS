import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MotionProvider } from "../shared/motion/MotionProvider";
import { useMotionMode } from "../shared/motion/useMotionMode";
import { ProfileProvider } from "../features/profiles/ProfileProvider";
import { ProfileSelectionScreen } from "../features/profiles/ProfileSelectionScreen";
import { StartupIntro } from "../features/startup/StartupIntro";
import { AppEntryGate } from "../features/startup/AppEntryGate";
import { useOnboarding } from "../features/onboarding/useOnboarding";
import { useAthleteSettings } from "../features/settings/hooks/useAthleteSettings";
import { useProfileContext } from "../features/profiles/useProfileContext";

const profiles = [
  {
    id: "p1",
    displayName: "Alex",
    iconSeed: "alex-route",
    iconVariant: "route",
    createdAt: "2026-05-17T08:00:00.000Z",
    updatedAt: "2026-05-17T08:00:00.000Z",
    cloudId: null,
    syncStatus: "local",
  },
  {
    id: "p2",
    displayName: "Mira",
    iconSeed: "mira-route",
    iconVariant: "route",
    createdAt: "2026-05-17T08:00:00.000Z",
    updatedAt: "2026-05-17T08:00:00.000Z",
    cloudId: null,
    syncStatus: "local",
  },
  {
    id: "p3",
    displayName: "Sam",
    iconSeed: "sam-route",
    iconVariant: "route",
    createdAt: "2026-05-17T08:00:00.000Z",
    updatedAt: "2026-05-17T08:00:00.000Z",
    cloudId: null,
    syncStatus: "local",
  },
] as const;

function renderWithProviders(ui: ReactNode) {
  return render(
    <ProfileProvider>
      <MotionProvider>
        {ui}
      </MotionProvider>
    </ProfileProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("StartupIntro", () => {
  it("renders the OUDENA welcome text and completes after the cinematic intro", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();

    render(
      <MotionProvider>
        <StartupIntro onComplete={onComplete} />
      </MotionProvider>,
    );

    expect(screen.getByTestId("startup-intro")).toBeTruthy();
    expect(screen.getByText("Willkommen bei OUDENA")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2200);
    });

    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("can render the logo-only startup entry", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();

    render(
      <MotionProvider>
        <StartupIntro onComplete={onComplete} showWelcomeText={false} />
      </MotionProvider>,
    );

    expect(screen.getByTestId("startup-intro")).toBeTruthy();
    expect(screen.queryByText("Willkommen bei OUDENA")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1050);
    });

    expect(onComplete).toHaveBeenCalledOnce();
  });
});

describe("AppEntryGate", () => {
  it("shows the intro when no profile exists yet", () => {
    renderWithProviders(
      <AppEntryGate>
        {() => <span>Home</span>}
      </AppEntryGate>,
    );

    expect(screen.getByTestId("startup-intro")).toBeTruthy();
  });

  it("shows the logo entry without welcome text when a profile already exists", () => {
    vi.useFakeTimers();
    localStorage.setItem("oudena_profiles", JSON.stringify([profiles[0]]));

    renderWithProviders(
      <AppEntryGate>
        {() => <span>Home</span>}
      </AppEntryGate>,
    );

    expect(screen.getByTestId("startup-intro")).toBeTruthy();
    expect(screen.queryByText("Willkommen bei OUDENA")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1050);
    });

    expect(screen.getByTestId("profile-selection-screen")).toBeTruthy();
    expect(screen.getByText("Alex")).toBeTruthy();
  });
});

describe("ProfileSelectionScreen", () => {
  it("creates a Kristof profile from existing legacy rides and settings", () => {
    localStorage.setItem("rideos-athlete", JSON.stringify({ height_cm: 184, weight_kg: 80, ftp_w: 255 }));
    localStorage.setItem("rideos_ride_history", JSON.stringify([{ id: "ride-1" }]));

    function Probe() {
      const { profiles } = useProfileContext();
      return <span>{profiles[0]?.displayName}</span>;
    }

    renderWithProviders(<Probe />);

    const storedProfiles = JSON.parse(localStorage.getItem("oudena_profiles") ?? "[]");
    expect(storedProfiles).toHaveLength(1);
    expect(storedProfiles[0].displayName).toBe("Kristof");
    expect(localStorage.getItem("oudena_profile_settings:kristof-local")).toBe(JSON.stringify({ height_cm: 184, weight_kg: 80, ftp_w: 255 }));
    expect(localStorage.getItem("oudena_history:kristof-local")).toBe(JSON.stringify([{ id: "ride-1" }]));
    expect(screen.getByText("Kristof")).toBeTruthy();
  });

  it("shows the plus tile when fewer than three profiles exist", () => {
    localStorage.setItem("oudena_profiles", JSON.stringify([profiles[0]]));

    renderWithProviders(<ProfileSelectionScreen onProfileSelected={vi.fn()} />);

    expect(screen.getByText("Alex")).toBeTruthy();
    expect(screen.getByText("Profil hinzufügen")).toBeTruthy();
  });

  it("hides the plus tile when three profiles exist", () => {
    localStorage.setItem("oudena_profiles", JSON.stringify(profiles));

    renderWithProviders(<ProfileSelectionScreen onProfileSelected={vi.fn()} />);

    expect(screen.getByText("Alex")).toBeTruthy();
    expect(screen.getByText("Mira")).toBeTruthy();
    expect(screen.getByText("Sam")).toBeTruthy();
    expect(screen.queryByText("Profil hinzufügen")).toBeNull();
  });

  it("creates and selects a new route-icon profile", () => {
    const onProfileSelected = vi.fn();
    renderWithProviders(<ProfileSelectionScreen onProfileSelected={onProfileSelected} />);

    fireEvent.click(screen.getByText("Profil hinzufügen"));
    fireEvent.change(screen.getByPlaceholderText("Dein Name"), { target: { value: "Jonas" } });
    fireEvent.click(screen.getByText("Profil anlegen"));

    const stored = JSON.parse(localStorage.getItem("oudena_profiles") ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].displayName).toBe("Jonas");
    expect(stored[0].iconVariant).toBe("route");
    expect(localStorage.getItem("oudena_active_profile_id")).toBe(stored[0].id);
    expect(onProfileSelected).toHaveBeenCalledOnce();
  });

  it("selecting an existing profile stores the active profile id", () => {
    const onProfileSelected = vi.fn();
    localStorage.setItem("oudena_profiles", JSON.stringify([profiles[0]]));

    renderWithProviders(<ProfileSelectionScreen onProfileSelected={onProfileSelected} />);
    fireEvent.click(screen.getByText("Alex"));

    expect(localStorage.getItem("oudena_active_profile_id")).toBe("p1");
    expect(onProfileSelected).toHaveBeenCalledOnce();
  });
});

describe("Profile-scoped preferences", () => {
  it("stores onboarding completion under the profile key", () => {
    const { result } = renderHook(() => useOnboarding("profile-a"));

    act(() => result.current.complete());

    expect(localStorage.getItem("oudena_onboarding_done:profile-a")).toBe("1");
    expect(localStorage.getItem("oudena_onboarding_done")).toBeNull();
  });

  it("stores athlete settings under the profile key", () => {
    const { result } = renderHook(() => useAthleteSettings("profile-a"));

    act(() => result.current.updateSetting("ftp_w", 260));

    const stored = JSON.parse(localStorage.getItem("oudena_profile_settings:profile-a") ?? "{}");
    expect(stored.ftp_w).toBe(260);
    expect(localStorage.getItem("rideos-athlete")).toBeNull();
  });
});

describe("MotionProvider", () => {
  it("defaults to cinematic motion", () => {
    const { result } = renderHook(() => useMotionMode(), {
      wrapper: ({ children }) => <MotionProvider>{children}</MotionProvider>,
    });

    expect(result.current.motionMode).toBe("cinematic");
    expect(result.current.effectiveMode).toBe("cinematic");
  });
});
