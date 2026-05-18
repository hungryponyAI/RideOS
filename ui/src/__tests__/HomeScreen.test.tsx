import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { RouteLibraryEntry } from "../shared/types/route";
import { HomeScreen } from "../features/home/HomeScreen";

vi.mock("../shared/ws/useWSSubscription", () => ({
  useWSSubscription: vi.fn(),
}));

vi.mock("../features/settings/hooks/useDeviceStatus", () => ({
  useDeviceStatus: () => ({ kickrConnected: false, clickConnected: false }),
}));

let fakeLibrary: RouteLibraryEntry[] = [];

vi.mock("../features/routes/hooks/useRouteLibrary", () => ({
  useRouteLibrary: () => fakeLibrary,
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
  fakeLibrary = [];
});

const makeRoute = (id: string, name: string, overrides = {}) => ({
  id,
  name,
  filename: `${id}.gpx`,
  added_at: "2026-05-01T10:00:00Z",
  distance_km: 42.0,
  elevation_gain_m: 800,
  elevation_loss_m: 800,
  elevation_thumbnail: [100, 200, 150, 300, 250],
  best_time_s: null,
  ride_count: 0,
  strava_id: null,
  sport_type: null,
  activity_date: null,
  moving_time_s: null,
  ...overrides,
});

function renderHome(props: Partial<ComponentProps<typeof HomeScreen>> = {}) {
  return render(
    <HomeScreen
      onOpenRoutes={vi.fn()}
      onStartRide={vi.fn()}
      onOpenDevices={vi.fn()}
      {...props}
    />
  );
}

describe("HomeScreen - empty state", () => {
  it("renders empty state when no routes exist", () => {
    renderHome();
    expect(screen.getByTestId("home-empty-state")).toBeTruthy();
  });

  it("does not render hero card when library is empty", () => {
    renderHome();
    expect(screen.queryByTestId("hero-recommendation")).toBeNull();
  });

  it("empty state shows import prompt that calls onOpenRoutes", () => {
    const onOpenRoutes = vi.fn();
    renderHome({ onOpenRoutes });
    fireEvent.click(screen.getByText(/GPX-Strecke importieren/i));
    expect(onOpenRoutes).toHaveBeenCalled();
  });

  it("empty state shows device prompt that calls onOpenDevices", () => {
    const onOpenDevices = vi.fn();
    renderHome({ onOpenDevices });
    fireEvent.click(screen.getByText(/Trainer verbinden/i));
    expect(onOpenDevices).toHaveBeenCalled();
  });
});

describe("HomeScreen - with routes", () => {
  it("renders hero recommendation when routes exist", () => {
    fakeLibrary = ([makeRoute("r1", "Alpenrunde")]);
    renderHome();
    expect(screen.getByTestId("hero-recommendation")).toBeTruthy();
  });

  it("renders one dominant start CTA", () => {
    fakeLibrary = ([makeRoute("r1", "Alpenrunde")]);
    renderHome();
    expect(screen.getByTestId("hero-start-btn")).toBeTruthy();
  });

  it("displays route name in hero", () => {
    fakeLibrary = ([makeRoute("r1", "Alpenrunde")]);
    renderHome();
    expect(screen.getByText("Alpenrunde")).toBeTruthy();
  });

  it("clicking hero start btn starts the route immediately", () => {
    fakeLibrary = ([makeRoute("r1", "Alpenrunde")]);
    const onStartRide = vi.fn();
    renderHome({ onStartRide });
    fireEvent.click(screen.getByTestId("hero-start-btn"));
    expect(onStartRide).toHaveBeenCalledWith("r1", "Alpenrunde");
  });

  it("clicking hero options btn opens route options", () => {
    fakeLibrary = ([makeRoute("r1", "Alpenrunde")]);
    const onOpenRoutes = vi.fn();
    renderHome({ onOpenRoutes });
    fireEvent.click(screen.getByTestId("hero-options-btn"));
    expect(onOpenRoutes).toHaveBeenCalledWith("r1", "options");
  });

  it("clicking hero start btn stores last route id in localStorage", () => {
    fakeLibrary = ([makeRoute("r1", "Alpenrunde")]);
    renderHome();
    fireEvent.click(screen.getByTestId("hero-start-btn"));
    expect(localStorageMock.getItem("rideos_last_route_id")).toBe("r1");
  });

  it("does not render empty state when routes exist", () => {
    fakeLibrary = ([makeRoute("r1", "Alpenrunde")]);
    renderHome();
    expect(screen.queryByTestId("home-empty-state")).toBeNull();
  });

  it("shows other routes section when more than one route exists", () => {
    fakeLibrary = ([
      makeRoute("r1", "Alpenrunde"),
      makeRoute("r2", "Küstenweg"),
    ]);
    renderHome();
    expect(screen.getByText("Weitere Strecken")).toBeTruthy();
  });

  it("clicking a compact route promotes it to the hero card", () => {
    fakeLibrary = ([
      makeRoute("r1", "Alpenrunde"),
      makeRoute("r2", "Küstenweg"),
    ]);
    const onStartRide = vi.fn();
    renderHome({ onStartRide });
    fireEvent.click(screen.getByText("Küstenweg"));
    expect(onStartRide).not.toHaveBeenCalled();
    expect(within(screen.getByTestId("hero-recommendation")).getByText("Küstenweg")).toBeTruthy();
    expect(localStorageMock.getItem("rideos_last_route_id")).toBe("r2");
  });

  it("clicking compact route options opens route options", () => {
    fakeLibrary = ([
      makeRoute("r1", "Alpenrunde"),
      makeRoute("r2", "Küstenweg"),
    ]);
    const onOpenRoutes = vi.fn();
    renderHome({ onOpenRoutes });
    fireEvent.click(screen.getByTestId("compact-options-r2"));
    expect(onOpenRoutes).toHaveBeenCalledWith("r2", "options");
  });

  it("does not show other routes section when only one route", () => {
    fakeLibrary = ([makeRoute("r1", "Alpenrunde")]);
    renderHome();
    expect(screen.queryByText("Weitere Strecken")).toBeNull();
  });
});

describe("HomeScreen - recommendation logic", () => {
  it("recommends last selected route from localStorage when available", () => {
    localStorageMock.setItem("rideos_last_route_id", "r2");
    fakeLibrary = ([
      makeRoute("r1", "Route Eins"),
      makeRoute("r2", "Zuletzt gefahren Route"),
    ]);
    renderHome();
    expect(screen.getByText("Zuletzt gefahren Route")).toBeTruthy();
  });

  it("shows reason badge on hero card", () => {
    fakeLibrary = ([makeRoute("r1", "Alpenrunde")]);
    renderHome();
    expect(screen.getByText("Empfohlen")).toBeTruthy();
  });
});
