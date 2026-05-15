import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { RouteFilterBar, applyRouteFilters, type RouteFilter } from "../features/routes/components/RouteFilterBar";
import type { RouteLibraryEntry } from "../shared/types/route";

function makeRoute(overrides: Partial<RouteLibraryEntry> = {}): RouteLibraryEntry {
  return {
    id: "r1", name: "Test", filename: "test.gpx", added_at: "2026-01-01T00:00:00Z",
    distance_km: 20, elevation_gain_m: 100, elevation_loss_m: 100,
    elevation_thumbnail: [100, 110, 120], best_time_s: null, ride_count: 0,
    strava_id: null, sport_type: null, activity_date: null, moving_time_s: null,
    ...overrides,
  };
}

const emptyFavorites = new Set<string>();

describe("applyRouteFilters", () => {
  it("returns all routes when no filters active", () => {
    const routes = [makeRoute({ id: "r1" }), makeRoute({ id: "r2" })];
    expect(applyRouteFilters(routes, new Set(), emptyFavorites)).toHaveLength(2);
  });

  it("short filter: keeps routes <= 25 km", () => {
    const routes = [makeRoute({ id: "r1", distance_km: 20 }), makeRoute({ id: "r2", distance_km: 30 })];
    const filtered = applyRouteFilters(routes, new Set<RouteFilter>(["short"]), emptyFavorites);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("r1");
  });

  it("ghost filter: keeps routes with best_time_s", () => {
    const routes = [makeRoute({ id: "r1", best_time_s: 3600 }), makeRoute({ id: "r2", best_time_s: null })];
    const filtered = applyRouteFilters(routes, new Set<RouteFilter>(["ghost"]), emptyFavorites);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("r1");
  });

  it("favorites filter: keeps routes in favorites set", () => {
    const routes = [makeRoute({ id: "r1" }), makeRoute({ id: "r2" })];
    const favs = new Set(["r2"]);
    const filtered = applyRouteFilters(routes, new Set<RouteFilter>(["favorites"]), favs);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("r2");
  });

  it("climb filter: keeps routes with gain/km >= 20", () => {
    const routes = [
      makeRoute({ id: "r1", distance_km: 10, elevation_gain_m: 300 }),  // 30m/km
      makeRoute({ id: "r2", distance_km: 10, elevation_gain_m: 100 }),  // 10m/km
    ];
    const filtered = applyRouteFilters(routes, new Set<RouteFilter>(["climb"]), emptyFavorites);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("r1");
  });

  it("combined filters apply AND logic", () => {
    const routes = [
      makeRoute({ id: "r1", distance_km: 15, best_time_s: 3600 }),
      makeRoute({ id: "r2", distance_km: 30, best_time_s: 3600 }),
      makeRoute({ id: "r3", distance_km: 15, best_time_s: null }),
    ];
    const filtered = applyRouteFilters(routes, new Set<RouteFilter>(["short", "ghost"]), emptyFavorites);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("r1");
  });
});

describe("RouteFilterBar", () => {
  it("renders available filter chips", () => {
    const routes = [makeRoute({ best_time_s: 3600 })];
    const { getByText } = render(
      <RouteFilterBar active={new Set()} routes={routes} favorites={emptyFavorites} onChange={vi.fn()} />
    );
    expect(getByText("Ghost")).toBeTruthy();
  });

  it("calls onChange when a filter is toggled", () => {
    const routes = [makeRoute({ best_time_s: 3600 })];
    const onChange = vi.fn();
    const { getByText } = render(
      <RouteFilterBar active={new Set()} routes={routes} favorites={emptyFavorites} onChange={onChange} />
    );
    fireEvent.click(getByText("Ghost"));
    expect(onChange).toHaveBeenCalled();
    const arg = onChange.mock.calls[0][0] as Set<RouteFilter>;
    expect(arg.has("ghost")).toBe(true);
  });

  it("shows reset button when filters are active", () => {
    const routes = [makeRoute({ best_time_s: 3600 })];
    const { getByText } = render(
      <RouteFilterBar active={new Set<RouteFilter>(["ghost"])} routes={routes} favorites={emptyFavorites} onChange={vi.fn()} />
    );
    expect(getByText("✕ Zurücksetzen")).toBeTruthy();
  });

  it("does not render when no filters match any route", () => {
    // distance > 30, gainPerKm ~14 (not short/flat/easy/recovery/climb, no ghost, no favorites)
    const routes = [makeRoute({ distance_km: 35, elevation_gain_m: 490, best_time_s: null })];
    const { container } = render(
      <RouteFilterBar active={new Set()} routes={routes} favorites={emptyFavorites} onChange={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });
});
