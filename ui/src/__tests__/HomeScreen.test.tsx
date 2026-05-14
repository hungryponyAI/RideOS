import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

describe("HomeScreen - empty state", () => {
  it("renders empty state when no routes exist", () => {
    render(<HomeScreen onOpenRoutes={vi.fn()} onOpenDevices={vi.fn()} />);
    expect(screen.getByTestId("home-empty-state")).toBeTruthy();
  });

  it("does not render hero card when library is empty", () => {
    render(<HomeScreen onOpenRoutes={vi.fn()} onOpenDevices={vi.fn()} />);
    expect(screen.queryByTestId("hero-recommendation")).toBeNull();
  });

  it("empty state shows import prompt that calls onOpenRoutes", () => {
    const onOpenRoutes = vi.fn();
    render(<HomeScreen onOpenRoutes={onOpenRoutes} onOpenDevices={vi.fn()} />);
    fireEvent.click(screen.getByText(/GPX-Strecke importieren/i));
    expect(onOpenRoutes).toHaveBeenCalled();
  });

  it("empty state shows device prompt that calls onOpenDevices", () => {
    const onOpenDevices = vi.fn();
    render(<HomeScreen onOpenRoutes={vi.fn()} onOpenDevices={onOpenDevices} />);
    fireEvent.click(screen.getByText(/Trainer verbinden/i));
    expect(onOpenDevices).toHaveBeenCalled();
  });
});

describe("HomeScreen - with routes", () => {
  it("renders hero recommendation when routes exist", () => {
    fakeLibrary = ([makeRoute("r1", "Alpenrunde")]);
    render(<HomeScreen onOpenRoutes={vi.fn()} onOpenDevices={vi.fn()} />);
    expect(screen.getByTestId("hero-recommendation")).toBeTruthy();
  });

  it("renders one dominant start CTA", () => {
    fakeLibrary = ([makeRoute("r1", "Alpenrunde")]);
    render(<HomeScreen onOpenRoutes={vi.fn()} onOpenDevices={vi.fn()} />);
    expect(screen.getByTestId("hero-start-btn")).toBeTruthy();
  });

  it("displays route name in hero", () => {
    fakeLibrary = ([makeRoute("r1", "Alpenrunde")]);
    render(<HomeScreen onOpenRoutes={vi.fn()} onOpenDevices={vi.fn()} />);
    expect(screen.getByText("Alpenrunde")).toBeTruthy();
  });

  it("clicking hero start btn calls onOpenRoutes with route id", () => {
    fakeLibrary = ([makeRoute("r1", "Alpenrunde")]);
    const onOpenRoutes = vi.fn();
    render(<HomeScreen onOpenRoutes={onOpenRoutes} onOpenDevices={vi.fn()} />);
    fireEvent.click(screen.getByTestId("hero-start-btn"));
    expect(onOpenRoutes).toHaveBeenCalledWith("r1");
  });

  it("clicking hero start btn stores last route id in localStorage", () => {
    fakeLibrary = ([makeRoute("r1", "Alpenrunde")]);
    render(<HomeScreen onOpenRoutes={vi.fn()} onOpenDevices={vi.fn()} />);
    fireEvent.click(screen.getByTestId("hero-start-btn"));
    expect(localStorageMock.getItem("rideos_last_route_id")).toBe("r1");
  });

  it("does not render empty state when routes exist", () => {
    fakeLibrary = ([makeRoute("r1", "Alpenrunde")]);
    render(<HomeScreen onOpenRoutes={vi.fn()} onOpenDevices={vi.fn()} />);
    expect(screen.queryByTestId("home-empty-state")).toBeNull();
  });

  it("shows other routes section when more than one route exists", () => {
    fakeLibrary = ([
      makeRoute("r1", "Alpenrunde"),
      makeRoute("r2", "Küstenweg"),
    ]);
    render(<HomeScreen onOpenRoutes={vi.fn()} onOpenDevices={vi.fn()} />);
    expect(screen.getByText("Weitere Strecken")).toBeTruthy();
  });

  it("does not show other routes section when only one route", () => {
    fakeLibrary = ([makeRoute("r1", "Alpenrunde")]);
    render(<HomeScreen onOpenRoutes={vi.fn()} onOpenDevices={vi.fn()} />);
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
    render(<HomeScreen onOpenRoutes={vi.fn()} onOpenDevices={vi.fn()} />);
    expect(screen.getByText("Zuletzt gefahren Route")).toBeTruthy();
  });

  it("shows reason badge on hero card", () => {
    fakeLibrary = ([makeRoute("r1", "Alpenrunde")]);
    render(<HomeScreen onOpenRoutes={vi.fn()} onOpenDevices={vi.fn()} />);
    expect(screen.getByText("Empfohlen")).toBeTruthy();
  });
});
