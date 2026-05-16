import { useMemo } from "react";
import type { RouteLibraryEntry } from "../../../shared/types/route";

const LAST_ROUTE_KEY = "rideos_last_route_id";

export function getLastRouteId(): string | null {
  try { return localStorage.getItem(LAST_ROUTE_KEY); } catch { return null; }
}

export function setLastRouteId(id: string): void {
  try { localStorage.setItem(LAST_ROUTE_KEY, id); } catch {
    // Ignore local cache write failures; route selection still works in memory.
  }
}

export type RecommendReason = "last_selected" | "recent" | "ridden" | "first";

export interface HomeRecommendation {
  route: RouteLibraryEntry;
  reason: RecommendReason;
}

export function useHomeRecommendation(library: RouteLibraryEntry[]): HomeRecommendation | null {
  return useMemo(() => {
    if (library.length === 0) return null;

    const lastId = getLastRouteId();
    if (lastId) {
      const found = library.find(r => r.id === lastId);
      if (found) return { route: found, reason: "last_selected" };
    }

    const withDate = library
      .filter(r => r.activity_date)
      .sort((a, b) => new Date(b.activity_date!).getTime() - new Date(a.activity_date!).getTime());
    if (withDate.length > 0) return { route: withDate[0], reason: "recent" };

    const ridden = library.filter(r => r.best_time_s !== null);
    if (ridden.length > 0) return { route: ridden[0], reason: "ridden" };

    return { route: library[0], reason: "first" };
  }, [library]);
}
