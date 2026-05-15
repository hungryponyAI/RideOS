import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRouteFavorites } from "../features/routes/hooks/useRouteFavorites";

describe("useRouteFavorites", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts empty", () => {
    const { result } = renderHook(() => useRouteFavorites());
    expect(result.current.isFavorite("r1")).toBe(false);
  });

  it("toggles a route as favorite", () => {
    const { result } = renderHook(() => useRouteFavorites());
    act(() => { result.current.toggle("r1"); });
    expect(result.current.isFavorite("r1")).toBe(true);
  });

  it("un-toggles a favorite", () => {
    const { result } = renderHook(() => useRouteFavorites());
    act(() => { result.current.toggle("r1"); });
    act(() => { result.current.toggle("r1"); });
    expect(result.current.isFavorite("r1")).toBe(false);
  });

  it("persists favorites to localStorage", () => {
    const { result } = renderHook(() => useRouteFavorites());
    act(() => { result.current.toggle("r2"); });
    const stored = JSON.parse(localStorage.getItem("oudena_route_favorites") ?? "[]");
    expect(stored).toContain("r2");
  });

  it("loads persisted favorites on mount", () => {
    localStorage.setItem("oudena_route_favorites", JSON.stringify(["r3"]));
    const { result } = renderHook(() => useRouteFavorites());
    expect(result.current.isFavorite("r3")).toBe(true);
  });

  it("handles malformed localStorage gracefully", () => {
    localStorage.setItem("oudena_route_favorites", "not-json");
    const { result } = renderHook(() => useRouteFavorites());
    expect(result.current.isFavorite("r1")).toBe(false);
  });
});
