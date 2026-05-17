import { useMemo } from "react";
import type { RouteLibraryEntry } from "../../../shared/types/route";

const LAST_ROUTE_KEY = "rideos_last_route_id";
const PROFILE_LAST_ROUTE_PREFIX = "oudena_last_route_id";

function storageKey(profileId?: string | null): string {
  return profileId ? `${PROFILE_LAST_ROUTE_PREFIX}:${profileId}` : LAST_ROUTE_KEY;
}

export function getLastRouteId(profileId?: string | null): string | null {
  try { return localStorage.getItem(storageKey(profileId)); } catch { return null; }
}

export function setLastRouteId(id: string, profileId?: string | null): void {
  try { localStorage.setItem(storageKey(profileId), id); } catch {
    // Ignore local cache write failures; route selection still works in memory.
  }
}

export type RecommendReason = "last_selected" | "recent" | "ridden" | "first";

export interface HomeRecommendation {
  route: RouteLibraryEntry;
  reason: RecommendReason;
}

export function useHomeRecommendation(library: RouteLibraryEntry[], profileId?: string | null): HomeRecommendation | null {
  return useMemo(() => {
    if (library.length === 0) return null;

    const lastId = getLastRouteId(profileId);
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
  }, [library, profileId]);
}
