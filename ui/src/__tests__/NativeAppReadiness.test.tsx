import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAppVisibility } from "../shared/hooks/useAppVisibility";
import { useRouteLibrary } from "../features/routes/hooks/useRouteLibrary";
import { useRideHistory } from "../features/history/useRideHistory";

vi.mock("../shared/ws/useWSSubscription", () => ({
  useWSSubscription: vi.fn((_type: string, cb: (msg: unknown) => void) => {
    (globalThis as Record<string, unknown>).__wsSubCb = cb;
  }),
}));

vi.mock("../shared/ws/useWS", () => ({
  useWS: () => ({ sendMessage: vi.fn(), status: "connected" }),
}));

// --- useAppVisibility ---

describe("useAppVisibility", () => {
  it("calls onHidden when visibilityState becomes hidden", () => {
    const onHidden = vi.fn();
    renderHook(() => useAppVisibility(onHidden));

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });

    expect(onHidden).toHaveBeenCalledTimes(1);
  });

  it("does not call onHidden when visibilityState is visible", () => {
    const onHidden = vi.fn();
    renderHook(() => useAppVisibility(onHidden));

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });

    expect(onHidden).not.toHaveBeenCalled();
  });

  it("removes listener on unmount", () => {
    const onHidden = vi.fn();
    const spy = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useAppVisibility(onHidden));
    unmount();
    expect(spy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    spy.mockRestore();
  });
});

// --- useRouteLibrary offline cache ---

describe("useRouteLibrary - offline cache", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("returns empty array when no cache and no WS data", () => {
    const { result } = renderHook(() => useRouteLibrary());
    expect(result.current).toEqual([]);
  });

  it("returns cached routes on init before WS responds", () => {
    const routes = [{ id: "r1", name: "Alpen-Tour", distance_m: 5000, elevation_gain_m: 200, gpx_filename: "a.gpx" }];
    localStorage.setItem("rideos_route_library", JSON.stringify(routes));
    const { result } = renderHook(() => useRouteLibrary());
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe("r1");
  });

  it("saves fresh data to localStorage when WS responds", () => {
    const { result: _result } = renderHook(() => useRouteLibrary());
    const cb = (globalThis as Record<string, unknown>).__wsSubCb as (msg: unknown) => void;

    const fresh = [{ id: "r2", name: "Schwarzwald", distance_m: 8000, elevation_gain_m: 400, gpx_filename: "b.gpx" }];
    act(() => { cb({ routes: fresh }); });

    const stored = JSON.parse(localStorage.getItem("rideos_route_library") ?? "[]");
    expect(stored[0].id).toBe("r2");
  });
});

// --- useRideHistory offline cache ---

describe("useRideHistory - offline cache", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("starts with empty list and loading=true when no cache", () => {
    const { result } = renderHook(() => useRideHistory());
    expect(result.current.rides).toEqual([]);
    expect(result.current.loading).toBe(true);
  });

  it("returns cached rides and loading=false when cache exists", () => {
    const rides = [{ id: "ride1", route_id: null, route_name: null, started_at: "2026-05-01T10:00:00Z", finished_at: null, duration_s: 3600, distance_m: 20000, avg_power_w: 180, completed: true }];
    localStorage.setItem("rideos_ride_history", JSON.stringify(rides));
    const { result } = renderHook(() => useRideHistory());
    expect(result.current.rides).toHaveLength(1);
    expect(result.current.loading).toBe(false);
  });

  it("persists fresh ride list to localStorage on WS response", () => {
    const { result: _result } = renderHook(() => useRideHistory());
    const cb = (globalThis as Record<string, unknown>).__wsSubCb as (msg: unknown) => void;

    const rides = [{ id: "ride2", route_id: "r1", route_name: "Tour", started_at: "2026-05-10T08:00:00Z", finished_at: "2026-05-10T09:00:00Z", duration_s: 3600, distance_m: 25000, avg_power_w: 200, completed: true }];
    act(() => { cb({ rides }); });

    const stored = JSON.parse(localStorage.getItem("rideos_ride_history") ?? "[]");
    expect(stored[0].id).toBe("ride2");
  });
});
